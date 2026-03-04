#!/usr/bin/env node
/**
 * cli-import.ts — Super Sequencer 9999 MIDI import CLI
 *
 * Converts one or more MIDI files back into balanced-ternary integer sequences.
 *
 * Usage:
 *   yarn import-midi [options]
 *
 * Example:
 *   yarn import-midi --input clip.mid --forte "5-35.05" --bpm 90
 */

import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';
import { PCS12 } from 'ultra-mega-enumerator';
import { midiToSequence } from './sequencer.js';

// ─── Argument Parsing ────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    forte:       { type: 'string',  short: 'f'                       },
    bpm:         { type: 'string',  short: 'b', default: '90'       },
    numerator:   { type: 'string',  short: 'n', default: '4'        },
    denominator: { type: 'string',  short: 'd', default: '5'        },
    octave:      { type: 'string',  short: 'o'                       },
    channels:    { type: 'string',  short: 'c', default: ''         },
    input:       { type: 'string',  short: 'i'                       },
    output:      { type: 'string',  short: 'O'                       },
    'no-trim':   { type: 'boolean',             default: false       },
    help:        { type: 'boolean', short: 'h', default: false       },
  },
  allowPositionals: false,
  strict: true,
});

// ─── Help ────────────────────────────────────────────────────────────────────

if (values.help) {
  console.log(`
Super Sequencer 9999 — CLI MIDI Importer

USAGE
  yarn import-midi [options]

OPTIONS
  -f, --forte <str>        Forte number override; auto-detected when omitted
  -b, --bpm <num>          Tempo in BPM                            [default: 90]
  -n, --numerator <num>    Time-signature numerator                [default: 4]
  -d, --denominator <num>  Time-signature denominator              [default: 5]
                           Also controls step duration:
                           quant = 60 / (bpm × denominator)
  -o, --octave <num>       Octave shift (trit 0 → degree octave×k) [default: auto]
  -c, --channels <str>     Comma-separated 1-based MIDI channels,
                           empty = all channels                    [default: ""]
  -i, --input <path>       Input .mid file or directory            [required]
  -O, --output <path>      Output file (single) or directory (batch);
                           defaults to stdout for single file
      --no-trim            Keep trailing zero steps
  -h, --help               Show this help and exit

EXAMPLES
  # Import a single MIDI file and print the sequence
  yarn import-midi --input clip.mid

  # Import a directory of MIDI files, writing each to an output directory
  yarn import-midi --input ./corpus --output ./sequences

  # Custom Forte number override and BPM
  yarn import-midi --input clip.mid --forte "3-11.01" --bpm 140
`);
  process.exit(0);
}

// ─── Parameter Validation ────────────────────────────────────────────────────

function parseIntParam(name: string, value: string | undefined, min: number, max: number): number {
  const n = parseInt(value ?? '', 10);
  if (Number.isNaN(n) || n < min || n > max) {
    console.error(`Error: --${name} must be an integer between ${min} and ${max} (got ${JSON.stringify(value)})`);
    process.exit(1);
  }
  return n;
}

if (!values.input) {
  console.error('Error: --input is required. Run --help for usage.');
  process.exit(1);
}

const forteOverride = values.forte as string | undefined;
const bpm         = parseIntParam('bpm',         values.bpm,         1, 499); // matches generate CLI limit
const denominator = parseIntParam('denominator', values.denominator, 1,  16);
const octave      = values.octave !== undefined
  ? parseIntParam('octave', values.octave, 0, 10)
  : undefined;

const channelsRaw = (values.channels as string).trim();
const channels: number[] = channelsRaw
  ? channelsRaw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !Number.isNaN(n))
  : [];

const trimTrailingZeros = !(values['no-trim'] as boolean);
const quantSeconds = 60 / (bpm * denominator);

// ─── Initialise ──────────────────────────────────────────────────────────────

await PCS12.init();

if (forteOverride && !PCS12.parseForte(forteOverride)) {
  console.error(`Error: unknown Forte number "${forteOverride}". Run --help for usage.`);
  process.exit(1);
}

// ─── File Collection ─────────────────────────────────────────────────────────

function collectMidiFiles(inputPath: string): string[] {
  const resolved = resolve(inputPath);
  const stat = statSync(resolved);
  if (stat.isDirectory()) {
    return collectFromDir(resolved);
  }
  return [resolved];
}

function collectFromDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFromDir(full));
    } else if (/\.(mid|midi)$/i.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

const inputFiles = collectMidiFiles(values.input as string);
if (inputFiles.length === 0) {
  console.error('Error: no .mid / .midi files found at the given input path.');
  process.exit(1);
}

const isBatch = inputFiles.length > 1 || statSync(resolve(values.input as string)).isDirectory();
const outputPath = values.output as string | undefined;

if (isBatch && outputPath) {
  mkdirSync(outputPath, { recursive: true });
}

// ─── Process ─────────────────────────────────────────────────────────────────

let processed = 0;

for (const filePath of inputFiles) {
  try {
    const buf = readFileSync(filePath);
    const midiData = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const { sequence, forte, octave: detectedOctave } = midiToSequence({
      midiData,
      forte: forteOverride,
      octave,
      quantSeconds,
      channels,
      trimTrailingZeros,
    });
    const line = sequence.map(n => n.toString()).join(' ');
    if (!forteOverride) {
      process.stderr.write(`  Detected forte for "${basename(filePath)}": ${forte}\n`);
    }
    if (octave === undefined) {
      process.stderr.write(`  Detected octave for "${basename(filePath)}": ${detectedOctave}\n`);
    }

    if (outputPath) {
      const stem = basename(filePath).replace(/\.(mid|midi)$/i, '');
      const outFile = isBatch
        ? join(outputPath, `${stem}.seq.txt`)
        : outputPath;
      writeFileSync(outFile, line + '\n');
    } else if (!isBatch) {
      process.stdout.write(line + '\n');
    } else {
      // batch with no output dir — print each line prefixed by filename
      process.stdout.write(`${filePath}: ${line}\n`);
    }

    processed++;
  } catch (err) {
    console.error(`Warning: failed to process "${filePath}": ${(err as Error).message}`);
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────

process.stderr.write(`Processed ${processed} file(s).\n`);
