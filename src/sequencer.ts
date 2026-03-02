/**
 * sequencer.ts — shared pure logic for Super Sequencer 9999.
 * No browser APIs; safe to import from both the Vue app and the CLI.
 */

// @tonejs/midi is a CommonJS module.
// • Vite (browser build) resolves named exports automatically.
// • Node.js native ESM wraps the whole CJS export under `.default`.
// We import the type for compile-time safety and handle the runtime divergence below.
import type { Midi } from '@tonejs/midi';
import * as _toneJs from '@tonejs/midi';
const MidiCtor: new () => Midi =
  (_toneJs as unknown as { Midi: new () => Midi }).Midi ??
  (_toneJs as unknown as { default: { Midi: new () => Midi } }).default?.Midi;

import { PCS12 } from 'ultra-mega-enumerator';

// ─── Balanced Ternary ────────────────────────────────────────────────────────

/**
 * Convert an integer to balanced ternary.
 * Returns trits (-1, 0, 1) from least-significant to most-significant position.
 * value = Σ trit[i] × 3^i
 */
export function toBalancedTernary(n: bigint): number[] {
  if (n === 0n) return [0];
  const trits: number[] = [];
  let v = n;
  while (v !== 0n) {
    let r = Number(((v % 3n) + 3n) % 3n); // normalise to 0, 1, or 2
    if (r === 2) {
      r = -1;
      v = (v + 1n) / 3n;
    } else {
      v = (v - BigInt(r)) / 3n;
    }
    trits.push(r);
  }
  return trits;
}

// ─── Scale ───────────────────────────────────────────────────────────────────

/**
 * Build the full MIDI-pitch scale from a Forte number string.
 * Expands the pitch-class set across all MIDI octaves (0-127).
 */
export function computeScale(forte: string): number[] {
  const s = PCS12.parseForte(forte);
  const p = s?.asSequence() ?? [];
  const o: number[] = [];
  for (const n of p) {
    for (let i = 0; i <= 10; i++) {
      const t = n + 12 * i;
      if (t < 128) o.push(t);
    }
  }
  o.sort((a, b) => a - b);
  return o;
}

// ─── Trit Events ─────────────────────────────────────────────────────────────

export interface TritStep {
  noteOns: number[];
  noteOffs: number[];
}

/**
 * Compute note-on / note-off events for every step of the sequence.
 * Each integer is decoded via balanced ternary; each trit addresses a scale degree.
 *
 * @param sequence  Integers as BigInt
 * @param forte     Forte number string (e.g. "5-35.05")
 * @param octave    Octave shift — trit 0 addresses scale degree `octave × k`
 */
export function computeTritEvents(
  sequence: bigint[],
  forte: string,
  octave: number,
): TritStep[] {
  const s = PCS12.parseForte(forte);
  if (!s) return [];
  const k = s.getK();
  const baseIdx = octave * k;
  const scale = computeScale(forte);

  return sequence.map((n) => {
    const trits = toBalancedTernary(n);
    const noteOns: number[] = [];
    const noteOffs: number[] = [];

    for (let t = 0; t < trits.length; t++) {
      const trit = trits[t];
      if (trit === 0) continue;
      const scaleIdx = baseIdx + t;
      if (scaleIdx < 0 || scaleIdx >= scale.length) continue;
      const midiNote = scale[scaleIdx];
      if (trit === 1) noteOns.push(midiNote);
      else if (trit === -1) noteOffs.push(midiNote);
    }

    return { noteOns, noteOffs };
  });
}

// ─── MIDI Generation ─────────────────────────────────────────────────────────

export interface SequencerParams {
  forte: string;
  bpm: number;
  /** Time-signature numerator (for display / DAW import). */
  numerator: number;
  /** Time-signature denominator — also drives step duration: quant = 60 / (bpm × denominator). */
  denominator: number;
  octave: number;
  sequence: bigint[];
  /** 0-based MIDI channel (0 = channel 1). */
  channel?: number;
}

/**
 * Generate a @tonejs/midi Midi object from sequencer parameters.
 * Works in both Node.js (CLI) and browser (Vue app).
 */
export function generateMidi(params: SequencerParams): Midi {
  const { forte, bpm, numerator, denominator, octave, sequence, channel = 0 } = params;

  // Step duration in seconds
  const quant = 60.0 / (bpm * denominator);

  const midi = new MidiCtor();
  const track = midi.addTrack();
  track.channel = channel;

  midi.header.setTempo(bpm);
  // Time signature for DAW display — denominator here is the standard MIDI power-of-2 value.
  // We store the raw numerator/denominator as a hint; DAWs will interpret it accordingly.
  midi.header.timeSignatures = [{ ticks: 0, timeSignature: [numerator, denominator] }];

  const events = computeTritEvents(sequence, forte, octave);
  const activeOnTimes = new Map<number, number>(); // midi note → onset time (seconds)

  for (let i = 0; i < events.length; i++) {
    const time = i * quant;
    const step = events[i];

    // Close retriggered notes first (note-on for an already-active note)
    for (const note of step.noteOns) {
      const onTime = activeOnTimes.get(note);
      if (onTime !== undefined) {
        track.addNote({ midi: note, time: onTime, duration: time - onTime, velocity: 0.5 });
        activeOnTimes.delete(note);
      }
    }

    // Process explicit note-offs
    for (const note of step.noteOffs) {
      const onTime = activeOnTimes.get(note);
      if (onTime !== undefined) {
        track.addNote({ midi: note, time: onTime, duration: time - onTime, velocity: 0.5 });
        activeOnTimes.delete(note);
      }
    }

    // Open new note-ons
    for (const note of step.noteOns) {
      activeOnTimes.set(note, time);
    }
  }

  // Close any notes still open at the end of the sequence
  const endTime = events.length * quant;
  for (const [note, onTime] of activeOnTimes) {
    track.addNote({ midi: note, time: onTime, duration: endTime - onTime, velocity: 0.5 });
  }

  return midi;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** ISO-8601 compact timestamp (UTC), e.g. "20260302T143022Z". */
export function formattedDateUTC(now = Date.now()): string {
  const d = new Date(now);
  return (
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0') +
    'T' +
    String(d.getUTCHours()).padStart(2, '0') +
    String(d.getUTCMinutes()).padStart(2, '0') +
    String(d.getUTCSeconds()).padStart(2, '0') +
    'Z'
  );
}
