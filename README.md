# Super Sequencer 9999

[https://ncg777.github.io/super-sequencer-9999/](https://ncg777.github.io/super-sequencer-9999/)

A browser-based step sequencer that uses **balanced ternary** encoding to express note-on, note-off, and hold (no-op) events from a single integer sequence.

## Controls

| Parameter | Description |
|---|---|
| **Forte number** | Pitch-class set (with transposition) used to build the scale. See [Forte numbers](https://en.wikipedia.org/wiki/List_of_set_classes). |
| **Waveform** | Oscillator type: sine, square, triangle, or sawtooth. |
| **Sequence** | Space-separated integers. Each integer is converted to balanced ternary; each trit maps to a scale degree. |
| **Tempo (BPM)** | Beats per minute. |
| **Numerator / Denominator** | Time signature. The step duration is `60 / (BPM × Denominator)` seconds. |
| **Octave shift** | Shifts which scale degree trit position 0 addresses. Trit `i` → scale degree `octave_shift × k + i` where `k` is the set cardinality. |
| **MIDI output** | Optional external MIDI device routing with channel selection. |
| **▶️ / ⏹️** | Start / stop the sequencer. |
| **🔇 All Notes Off** | Immediately silences every sounding note without stopping the sequencer. |
| **📋 Copy URL** | Copies a shareable URL with all current settings. |
| **Download MIDI** | Exports the sequence as a Standard MIDI file. |

## Balanced Ternary Encoding

Every integer has a unique representation in balanced ternary (base 3 with digits **{-1, 0, 1}**):

```
value = Σ trit[i] × 3^i
```

Each trit position `i` addresses a scale degree. The trit value determines the MIDI event:

| Trit | Meaning |
|------|---------|
| **+1** | **Note ON** — begin (or retrigger) the MIDI pitch at that scale degree. |
| **-1** | **Note OFF** — release the MIDI pitch at that scale degree. |
| **0** | **No-op** — the note keeps its current state (sustain or silence). |

### Conversion Examples

| Integer | Trits (trit₀ trit₁ …) | Effect |
|---------|------------------------|--------|
| `0` | `[0]` | Hold / rest — no change |
| `1` | `[1]` | Note ON degree 0 |
| `-1` | `[-1]` | Note OFF degree 0 |
| `3` | `[0, 1]` | Note ON degree 1 |
| `4` | `[1, 1]` | Note ON degrees 0 and 1 |
| `13` | `[1, 1, 1]` | Note ON degrees 0, 1, and 2 |
| `-13` | `[-1, -1, -1]` | Note OFF degrees 0, 1, and 2 |
| `5` | `[-1, -1, 1]` | Note OFF 0–1, Note ON 2 |

### Stateful Playback

Notes **accumulate**: an ON persists until an explicit OFF appears in a later step. This enables sustain, overlapping voices, and precise rhythmic articulation — all from plain integers.

### Integer Limits

Sequence values are parsed as **BigInt**, so there is no JavaScript numeric precision limit. The practical range is determined by the scale size:

- A scale with **N** degrees requires at most **N** trits.
- Maximum meaningful magnitude: `(3^N − 1) / 2`.
- Chromatic set (k = 12): N ≈ 128 ⇒ max ≈ ±5.7 × 10⁶⁰.
- Pentatonic set (k = 5): N ≈ 55 ⇒ max ≈ ±7.4 × 10²⁵.
- Trits beyond position N are simply ignored.

### Quick Reference

Powers of 3 are the building blocks: `3^i` turns on exactly scale degree `i`, and `-3^i` turns it off. Sums and differences combine operations. `0` is a rest/hold step.

