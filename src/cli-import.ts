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
import { createWriteStream, readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, basename, dirname, join } from 'node:path';
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
  -O, --output <path>      Output .json file; in batch mode all records are
                           written as a single JSON array to this file.
                           Defaults to stdout.
      --no-trim            Keep trailing zero steps
  -h, --help               Show this help and exit

EXAMPLES
  # Import a single MIDI file and print the sequence
  yarn import-midi --input clip.mid

  # Import a directory of MIDI files into a single JSON array file
  yarn import-midi --input ./corpus --output ./corpus.json

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

// Open output sink for batch mode: stream records one-by-one so the entire
// array never has to live in memory (avoids RangeError on large corpora).
type Sink = { write(s: string): void; end(): void };
let batchSink: Sink | null = null;
let firstBatchRecord = true;

if (isBatch) {
  if (outputPath) {
    // Ensure parent directory exists.
    const parentDir = dirname(resolve(outputPath));
    const { mkdirSync: mkdir } = await import('node:fs');
    mkdir(parentDir, { recursive: true });
    const ws = createWriteStream(outputPath, { encoding: 'utf8' });
    batchSink = { write: (s) => { ws.write(s); }, end: () => ws.end() };
  } else {
    batchSink = { write: (s) => { process.stdout.write(s); }, end: () => {} };
  }
  batchSink.write('[\n');
}

// ─── Process ─────────────────────────────────────────────────────────────────

let processed = 0;

for (const filePath of inputFiles) {
  try {
    const buf = readFileSync(filePath);
    const midiData = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const { sequence, forte, octave: detectedOctave, bpm: detectedBpm, numerator: detectedNumerator, denominator: detectedDenominator } = midiToSequence({
      midiData,
      forte: forteOverride,
      octave,
      quantSeconds,
      channels,
      trimTrailingZeros,
    });
    if (!forteOverride) {
      process.stderr.write(`  Detected forte for "${basename(filePath)}": ${forte}\n`);
    }
    if (octave === undefined) {
      process.stderr.write(`  Detected octave for "${basename(filePath)}": ${detectedOctave}\n`);
    }

    // Sequence values are BigInt; serialise as strings to stay within JSON spec.
    const record = {
      filename: basename(filePath),
      forte,
      octave: detectedOctave,
      bpm: detectedBpm,
      numerator: detectedNumerator,
      denominator: detectedDenominator,
      sequence: sequence.map(n => n.toString()),
    };

    if (isBatch) {
      // Stream each record as a compact JSON line into the array.
      const comma = firstBatchRecord ? '' : ',';
      batchSink!.write(comma + JSON.stringify(record) + '\n');
      firstBatchRecord = false;
    } else if (outputPath) {
      writeFileSync(outputPath, JSON.stringify(record, null, 2) + '\n');
    } else {
      process.stdout.write(JSON.stringify(record, null, 2) + '\n');
    }

    processed++;
  } catch (err) {
    console.error(`Warning: failed to process "${filePath}": ${(err as Error).message}`);
  }
}

// ─── Flush batch output ──────────────────────────────────────────────────────

if (isBatch && batchSink) {
  batchSink.write(']\n');
  batchSink.end();
}

// ─── Summary ─────────────────────────────────────────────────────────────────

process.stderr.write(`Processed ${processed} file(s).\n`);
