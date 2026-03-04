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
// Handle CJS/ESM duality: Vite resolves named exports; Node.js wraps under `.default`.
// The constructor accepts optional raw MIDI data (Uint8Array | ArrayBuffer) or nothing.
const MidiCtor: { new(): Midi; new(data: Uint8Array | ArrayBuffer): Midi } =
  (_toneJs as any).Midi ?? (_toneJs as any).default?.Midi;

import { PCS12, ImmutableCombination } from 'ultra-mega-enumerator';

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

// ─── MIDI Import ─────────────────────────────────────────────────────────────

export interface MidiToSequenceResult {
  /** The recovered balanced-ternary integer sequence. */
  sequence: bigint[];
  /** The Forte number detected from (or supplied for) this MIDI file. */
  forte: string;
  /** The octave shift detected from (or supplied for) this MIDI file. */
  octave: number;
  /** BPM read from the MIDI file header (falls back to 120 if absent). */
  bpm: number;
  /** Time-signature numerator read from the MIDI file header (falls back to 4 if absent). */
  numerator: number;
  /** Time-signature denominator read from the MIDI file header (falls back to 4 if absent). */
  denominator: number;
}

export interface MidiToSequenceParams {
  /** Raw MIDI file bytes (works in both browser and Node.js). */
  midiData: Uint8Array | ArrayBuffer;
  /**
   * Forte number to use for scale construction. When omitted, the pitch-class
   * set is detected automatically from the notes present in the MIDI file.
   */
  forte?: string;
  /**
   * Octave shift. When omitted, automatically detected from the lowest note
   * present in the MIDI data so that no notes are dropped.
   */
  octave?: number;
  /**
   * Step duration in seconds. When omitted, computed automatically from the
   * MIDI file header as `60 / (bpm × denominator)`.  Use `60 / (bpm × denominator)`
   * to match the sequencer's own quant value when overriding.
   */
  quantSeconds?: number;
  /**
   * Which MIDI channels to consider (1-based, empty = all channels).
   * Default: all channels.
   */
  channels?: number[];
  /**
   * When true, trim trailing zero steps from the output.
   * Default: true.
   */
  trimTrailingZeros?: boolean;
}

/**
 * Parse a MIDI file and recover the balanced-ternary integer sequence that
 * encodes it, using the inverse of the `generateMidi` algorithm.
 *
 * All tracks and channels are merged into a single note pool before processing.
 * When `forte` is not supplied, the pitch-class set is detected automatically
 * from the notes present in the file.
 */
export function midiToSequence(params: MidiToSequenceParams): MidiToSequenceResult {
  const { midiData, channels, trimTrailingZeros = true } = params;

  const midi = new MidiCtor(midiData);

  // ── Read tempo & time-signature from the MIDI header ──────────────────────
  const headerBpm = midi.header.tempos?.length > 0 ? midi.header.tempos[0].bpm : 120;
  const headerTimeSig: [number, number] = midi.header.timeSignatures?.length > 0
    ? midi.header.timeSignatures[0].timeSignature as [number, number]
    : [4, 4];
  const headerNumerator = headerTimeSig[0];
  const headerDenominator = headerTimeSig[1];

  // Use caller-supplied quant when provided; otherwise derive from the header.
  const quantSeconds = params.quantSeconds ?? (60 / (headerBpm * headerDenominator));

  // Collect all notes from all tracks into a single pool, applying the
  // optional channel filter.  Treating every track as one combined stream
  // ensures multi-track / multi-channel files are handled uniformly.
  const allNotes: Array<{ midi: number; time: number; duration: number }> = [];
  for (const track of midi.tracks) {
    // @tonejs/midi track.channel is 0-based; channels param is 1-based
    if (channels && channels.length > 0 && !channels.includes(track.channel + 1)) continue;
    for (const note of track.notes) {
      allNotes.push(note);
    }
  }

  if (allNotes.length === 0) {
    return { sequence: [], forte: params.forte ?? '0-1', octave: params.octave ?? 0, bpm: headerBpm, numerator: headerNumerator, denominator: headerDenominator };
  }

  // Auto-detect forte from pitch classes when the caller did not supply one.
  const resolvedForte: string = params.forte ?? PCS12.identify(ImmutableCombination.createWithSizeAndSet(12, new Set(allNotes.map(n => n.midi % 12)))).toString();

  const s = PCS12.parseForte(resolvedForte);
  if (!s) return { sequence: [], forte: resolvedForte, octave: params.octave ?? 0, bpm: headerBpm, numerator: headerNumerator, denominator: headerDenominator };
  const k = s.getK();
  const scale = computeScale(resolvedForte);

  // Auto-detect octave from the lowest note present when not explicitly supplied.
  // This ensures no notes are silently dropped due to tritPos < 0.
  let effectiveOctave: number;
  if (params.octave !== undefined) {
    effectiveOctave = params.octave;
  } else {
    const scaleIndices = allNotes
      .map(n => scale.indexOf(n.midi))
      .filter(i => i !== -1);
    if (scaleIndices.length === 0) {
      return { sequence: [], forte: resolvedForte, octave: 0, bpm: headerBpm, numerator: headerNumerator, denominator: headerDenominator };
    }
    const minScaleIdx = Math.min(...scaleIndices);
    effectiveOctave = Math.floor(minScaleIdx / k);
  }
  const baseIdx = effectiveOctave * k;

  // Track note-ons and note-offs separately per step/tritPos.
  // Using separate counts (instead of a single accumulated delta) prevents
  // retriggers from being silently cancelled: a note-off + note-on at the
  // same step on the same pitch would sum to 0 with plain accumulation,
  // but should produce a +1 trit (retrigger).
  const stepMap = new Map<number, Map<number, { ons: number; offs: number }>>();

  const addEvent = (step: number, tritPos: number, isOn: boolean) => {
    let posMap = stepMap.get(step);
    if (!posMap) { posMap = new Map(); stepMap.set(step, posMap); }
    const entry = posMap.get(tritPos) ?? { ons: 0, offs: 0 };
    if (isOn) entry.ons++; else entry.offs++;
    posMap.set(tritPos, entry);
  };

  for (const note of allNotes) {
    const scaleIdx = scale.indexOf(note.midi);
    if (scaleIdx === -1) continue;
    const tritPos = scaleIdx - baseIdx;
    if (tritPos < 0) continue;
    const onStep = Math.round(note.time / quantSeconds);
    let offStep = Math.round((note.time + note.duration) / quantSeconds);
    // Ensure every note spans at least one step; otherwise note-on and
    // note-off land on the same step, the on wins via priority, and
    // the off is silently lost — producing a stuck note.
    if (offStep <= onStep) offStep = onStep + 1;
    addEvent(onStep, tritPos, true);
    addEvent(offStep, tritPos, false);
  }

  if (stepMap.size === 0) return { sequence: [], forte: resolvedForte, octave: effectiveOctave, bpm: headerBpm, numerator: headerNumerator, denominator: headerDenominator };

  const maxStep = Math.max(...stepMap.keys());
  const result: bigint[] = [];

  for (let step = 0; step <= maxStep; step++) {
    const posMap = stepMap.get(step);
    let n = 0n;
    if (posMap) {
      for (const [tritPos, { ons, offs }] of posMap) {
        // Note-on (including retrigger) takes priority over note-off.
        // This matches generateMidi which closes then re-opens on retrigger.
        let trit: number;
        if (ons > 0) trit = 1;
        else if (offs > 0) trit = -1;
        else trit = 0;
        if (trit !== 0) {
          n += BigInt(trit) * (3n ** BigInt(tritPos));
        }
      }
    }
    result.push(n);
  }

  if (trimTrailingZeros) {
    while (result.length > 0 && result[result.length - 1] === 0n) {
      result.pop();
    }
  }

  return { sequence: result, forte: resolvedForte, octave: effectiveOctave, bpm: headerBpm, numerator: headerNumerator, denominator: headerDenominator };
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
