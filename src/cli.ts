#!/usr/bin/env node
/**
 * cli.ts — Super Sequencer 9999 command-line interface
 *
 * Generates a MIDI file from a balanced-ternary integer sequence without
 * opening a browser. Mirrors every parameter available in the web UI.
 *
 * Usage:
 *   yarn generate [options]
 *
 * Example:
 *   yarn generate --forte "5-35.05" --bpm 120 --sequence "1 3 9 -1 -3 -9" --output out.mid
 */

import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import { PCS12 } from 'ultra-mega-enumerator';
import { generateMidi, formattedDateUTC } from './sequencer.js';

// ─── Argument Parsing ────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    forte:       { type: 'string',  short: 'f', default: '5-35.05' },
    bpm:         { type: 'string',  short: 'b', default: '90'       },
    numerator:   { type: 'string',  short: 'n', default: '4'        },
    denominator: { type: 'string',  short: 'd', default: '5'        },
    octave:      { type: 'string',  short: 'o', default: '6'        },
    sequence:    { type: 'string',  short: 's', default: '1 3 9 -1 -3 -9' },
    channel:     { type: 'string',  short: 'c', default: '1'        },
    output:      { type: 'string',  short: 'O'                       },
    help:        { type: 'boolean', short: 'h', default: false       },
  },
  allowPositionals: false,
  strict: true,
});

// ─── Help ────────────────────────────────────────────────────────────────────

if (values.help) {
  console.log(`
Super Sequencer 9999 — CLI MIDI Generator

USAGE
  yarn generate [options]

OPTIONS
  -f, --forte <str>        Forte number of the pitch-class set     [default: "5-35.05"]
  -b, --bpm <num>          Tempo in BPM                            [default: 90]
  -n, --numerator <num>    Time-signature numerator                [default: 4]
  -d, --denominator <num>  Time-signature denominator              [default: 5]
                           Also controls step duration:
                           quant = 60 / (bpm × denominator)
  -o, --octave <num>       Octave shift (trit 0 → degree octave×k) [default: 6]
  -s, --sequence <str>     Space-separated integers in balanced
                           ternary order                           [default: "1 3 9 -1 -3 -9"]
  -c, --channel <num>      MIDI channel 1–16                       [default: 1]
  -O, --output <path>      Output .mid file path                   [default: auto]
  -h, --help               Show this help and exit

EXAMPLES
  # Default pentatonic riff at 90 BPM
  yarn generate

  # Custom Forte number, faster tempo, different octave
  yarn generate --forte "3-11.01" --bpm 140 --octave 5

  # Full chromatic cluster, written to a specific file
  yarn generate -f "12-1" -b 120 -s "1 -1 3 -3" -O cluster.mid

  # Long sequence piped from a file (PowerShell)
  yarn generate -s (Get-Content sequence.txt -Raw).Trim() -O output.mid

NOTES
  • Integers are parsed as BigInt (arbitrary precision).
  • Each integer is decoded in balanced ternary (digits {-1,0,+1}).
  • Trit position i addresses scale degree (octave × k + i), where k is
    the cardinality of the pitch-class set.
  • +1 = note ON, -1 = note OFF, 0 = no-op / hold.
  • See the web UI help panel for full encoding documentation.
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

const forte       = values.forte as string;
const bpm         = parseIntParam('bpm',         values.bpm,         1, 499);
const numerator   = parseIntParam('numerator',   values.numerator,   1,  16);
const denominator = parseIntParam('denominator', values.denominator, 1,  16);
const octave      = parseIntParam('octave',      values.octave,      0,  10);
const channel     = parseIntParam('channel',     values.channel,     1,  16);

const sequenceRaw = (values.sequence as string).trim();
if (!sequenceRaw) {
  console.error('Error: --sequence must not be empty.');
  process.exit(1);
}

const sequence: bigint[] = [];
for (const token of sequenceRaw.split(/\s+/).filter(Boolean)) {
  try {
    sequence.push(BigInt(token));
  } catch {
    console.error(`Error: invalid integer in sequence: "${token}"`);
    process.exit(1);
  }
}

// ─── Generate ────────────────────────────────────────────────────────────────

// PCS12 requires async initialisation (loads chord data)
await PCS12.init();

// Validate Forte number
if (!PCS12.parseForte(forte)) {
  console.error(`Error: unknown Forte number "${forte}". Run --help for usage.`);
  process.exit(1);
}

const midi = generateMidi({
  forte,
  bpm,
  numerator,
  denominator,
  octave,
  sequence,
  channel: channel - 1, // convert 1-based UI value to 0-based MIDI channel
});

// ─── Output ──────────────────────────────────────────────────────────────────

const outputPath =
  (values.output as string | undefined) ??
  `SSeq9999-${formattedDateUTC()}-${forte}-${bpm}bpm-${numerator}on${denominator}timesig.mid`;

const data = midi.toArray();
writeFileSync(outputPath, Buffer.from(data.buffer as ArrayBuffer));

console.log(`Wrote ${sequence.length} steps → ${outputPath}`);
console.log(`  forte=${forte}  bpm=${bpm}  time=${numerator}/${denominator}  octave=${octave}  channel=${channel}`);
