#!/usr/bin/env node
/**
 * mcp-server.ts — Super Sequencer 9999 MCP server
 *
 * Exposes the sequencer's MIDI generation and import capabilities as MCP tools
 * so that AI assistants (Claude, Copilot, etc.) can generate and analyse MIDI
 * files through the Model Context Protocol.
 *
 * Start via stdio (the standard MCP transport):
 *   yarn mcp-server
 *
 * Tools exposed:
 *   • generate_midi  — build a MIDI file from a balanced-ternary sequence
 *   • import_midi    — recover a balanced-ternary sequence from MIDI bytes
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { PCS12 } from 'ultra-mega-enumerator';
import { generateMidi, midiToSequence, formattedDateUTC } from './sequencer.js';

// ─── Initialise PCS12 once ───────────────────────────────────────────────────

await PCS12.init();

// ─── Server ──────────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'super-sequencer-9999', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

// ─── Tool: generate_midi ─────────────────────────────────────────────────────

const GENERATE_TOOL = {
  name: 'generate_midi',
  description:
    'Generate a Standard MIDI file from a balanced-ternary integer sequence. ' +
    'Returns the MIDI bytes encoded as a base64 string together with a suggested filename.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      forte: {
        type: 'string',
        description: 'Forte number of the pitch-class set (e.g. "5-35.05").',
        default: '5-35.05',
      },
      bpm: {
        type: 'integer',
        description: 'Tempo in beats per minute (1–499).',
        default: 90,
        minimum: 1,
        maximum: 499,
      },
      numerator: {
        type: 'integer',
        description: 'Time-signature numerator (1–16).',
        default: 4,
        minimum: 1,
        maximum: 16,
      },
      denominator: {
        type: 'integer',
        description:
          'Time-signature denominator (1–16). Also controls step duration: quant = 60 / (bpm × denominator).',
        default: 5,
        minimum: 1,
        maximum: 16,
      },
      octave: {
        type: 'integer',
        description: 'Octave shift — trit 0 addresses scale degree (octave × k) where k is the set cardinality (0–10).',
        default: 6,
        minimum: 0,
        maximum: 10,
      },
      sequence: {
        type: 'string',
        description:
          'Space-separated integers in balanced-ternary order, e.g. "1 3 9 -1 -3 -9". ' +
          'Each integer is decoded in balanced ternary; each trit maps to a scale degree.',
        default: '1 3 9 -1 -3 -9',
      },
      channel: {
        type: 'integer',
        description: 'MIDI channel 1–16.',
        default: 1,
        minimum: 1,
        maximum: 16,
      },
    },
    required: [],
  },
};

// ─── Tool: import_midi ───────────────────────────────────────────────────────

const IMPORT_TOOL = {
  name: 'import_midi',
  description:
    'Recover a balanced-ternary integer sequence from a Standard MIDI file. ' +
    'Accepts the MIDI file as a base64-encoded string and returns the sequence ' +
    'together with detected tempo and pitch-class-set metadata.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      midi_base64: {
        type: 'string',
        description: 'The raw MIDI file bytes encoded as base64.',
      },
      forte: {
        type: 'string',
        description:
          'Forte number override (e.g. "5-35.05"). When omitted the pitch-class set is auto-detected from the notes in the file.',
      },
      bpm: {
        type: 'integer',
        description:
          'BPM override used to compute step duration: quant = 60 / (bpm × denominator). ' +
          'When omitted the tempo from the MIDI header is used.',
        minimum: 1,
        maximum: 499,
      },
      denominator: {
        type: 'integer',
        description:
          'Denominator override for step-duration computation. When omitted the time-signature denominator from the MIDI header is used.',
        minimum: 1,
        maximum: 16,
      },
      octave: {
        type: 'integer',
        description: 'Octave shift override (0–10). When omitted it is auto-detected from the lowest note in the file.',
        minimum: 0,
        maximum: 10,
      },
      channels: {
        type: 'string',
        description: 'Comma-separated 1-based MIDI channels to include, e.g. "1,2". Empty string = all channels.',
        default: '',
      },
      no_trim: {
        type: 'boolean',
        description: 'When true, trailing zero steps are kept in the output. Default: false.',
        default: false,
      },
    },
    required: ['midi_base64'],
  },
};

// ─── List tools ──────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [GENERATE_TOOL, IMPORT_TOOL],
}));

// ─── Call tool ───────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  // ── generate_midi ──────────────────────────────────────────────────────────
  if (name === 'generate_midi') {
    const forte       = (args.forte       as string  | undefined) ?? '5-35.05';
    const bpm         = Math.round((args.bpm         as number  | undefined) ?? 90);
    const numerator   = Math.round((args.numerator   as number  | undefined) ?? 4);
    const denominator = Math.round((args.denominator as number  | undefined) ?? 5);
    const octave      = Math.round((args.octave      as number  | undefined) ?? 6);
    const channel     = Math.round((args.channel     as number  | undefined) ?? 1);
    const sequenceRaw = ((args.sequence as string | undefined) ?? '1 3 9 -1 -3 -9').trim();

    // Validate ranges
    function assertRange(label: string, v: number, min: number, max: number) {
      if (v < min || v > max) throw new Error(`${label} must be between ${min} and ${max} (got ${v})`);
    }
    assertRange('bpm', bpm, 1, 499);
    assertRange('numerator', numerator, 1, 16);
    assertRange('denominator', denominator, 1, 16);
    assertRange('octave', octave, 0, 10);
    assertRange('channel', channel, 1, 16);

    if (!sequenceRaw) throw new Error('sequence must not be empty');

    // Parse sequence
    const sequence: bigint[] = [];
    for (const token of sequenceRaw.split(/\s+/).filter(Boolean)) {
      try {
        sequence.push(BigInt(token));
      } catch {
        throw new Error(`Invalid integer in sequence: "${token}"`);
      }
    }

    // Validate forte
    if (!PCS12.parseForte(forte)) {
      throw new Error(`Unknown Forte number "${forte}"`);
    }

    const midi = generateMidi({
      forte,
      bpm,
      numerator,
      denominator,
      octave,
      sequence,
      channel: channel - 1, // convert 1-based to 0-based
    });

    const data = midi.toArray();
    const base64 = Buffer.from(data.buffer as ArrayBuffer).toString('base64');
    const filename = `SSeq9999-${formattedDateUTC()}-${forte}-${bpm}bpm-${numerator}on${denominator}timesig.mid`;

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ filename, midi_base64: base64, steps: sequence.length }, null, 2),
        },
      ],
    };
  }

  // ── import_midi ────────────────────────────────────────────────────────────
  if (name === 'import_midi') {
    const midiBase64 = args.midi_base64 as string;
    if (!midiBase64) throw new Error('midi_base64 is required');

    const midiData = new Uint8Array(Buffer.from(midiBase64, 'base64'));

    // Optional overrides
    const forteOverride   = args.forte as string | undefined;
    const bpmOverride     = args.bpm   !== undefined ? Math.round(args.bpm as number) : undefined;
    const denomOverride   = args.denominator !== undefined ? Math.round(args.denominator as number) : undefined;
    const octaveOverride  = args.octave !== undefined ? Math.round(args.octave as number) : undefined;
    const noTrim          = (args.no_trim as boolean | undefined) ?? false;

    const channelsRaw = ((args.channels as string | undefined) ?? '').trim();
    const channels: number[] = channelsRaw
      ? channelsRaw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !Number.isNaN(n))
      : [];

    if (forteOverride && !PCS12.parseForte(forteOverride)) {
      throw new Error(`Unknown Forte number "${forteOverride}"`);
    }

    // Build quantSeconds from overrides if both bpm and denominator are supplied.
    const quantSeconds =
      bpmOverride !== undefined && denomOverride !== undefined
        ? 60 / (bpmOverride * denomOverride)
        : undefined;

    const result = midiToSequence({
      midiData,
      forte: forteOverride,
      octave: octaveOverride,
      quantSeconds,
      channels,
      trimTrailingZeros: !noTrim,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              forte: result.forte,
              octave: result.octave,
              bpm: result.bpm,
              numerator: result.numerator,
              denominator: result.denominator,
              sequence: result.sequence.map(n => n.toString()),
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// ─── Connect ─────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
