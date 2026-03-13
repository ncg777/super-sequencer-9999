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

## CLI

Two command-line tools are included for headless MIDI generation and import. Both require [Node.js](https://nodejs.org/) and are run with `yarn`.

### MIDI Generator — `yarn generate`

Generates a Standard MIDI file from a balanced-ternary sequence.

```
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
```

**Examples**

```bash
# Default pentatonic riff at 90 BPM (auto-named output file)
yarn generate

# Custom Forte number, faster tempo, different octave
yarn generate --forte "3-11.01" --bpm 140 --octave 5

# Full chromatic cluster, written to a specific file
yarn generate -f "12-1" -b 120 -s "1 -1 3 -3" -O cluster.mid
```

### MIDI Importer — `yarn import-midi`

Recovers balanced-ternary sequences from one or more MIDI files.

```
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
```

**Examples**

```bash
# Import a single MIDI file and print the sequence to stdout
yarn import-midi --input clip.mid

# Import a directory of MIDI files into a single JSON array file
yarn import-midi --input ./corpus --output ./corpus.json

# Custom Forte number override and BPM
yarn import-midi --input clip.mid --forte "3-11.01" --bpm 140
```

## MCP Server

Super Sequencer 9999 ships an [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that exposes the sequencer's capabilities as tools for AI assistants such as Claude or GitHub Copilot.

### Starting the server

```bash
yarn mcp-server
```

The server communicates over **stdio** using the standard MCP JSON-RPC protocol. No port is opened.

### Registering with an MCP client

Add the following entry to your MCP client's configuration (the exact file path varies by client):

```json
{
  "mcpServers": {
    "super-sequencer-9999": {
      "command": "yarn",
      "args": ["--cwd", "/path/to/super-sequencer-9999", "mcp-server"]
    }
  }
}
```

Replace `/path/to/super-sequencer-9999` with the absolute path to this repository.

### Available tools

#### `generate_midi`

Generate a Standard MIDI file from a balanced-ternary integer sequence. Returns the MIDI bytes as a **base64** string and a suggested filename.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `forte` | string | `"5-35.05"` | Forte number of the pitch-class set. |
| `bpm` | integer | `90` | Tempo in BPM (1–499). |
| `numerator` | integer | `4` | Time-signature numerator (1–16). |
| `denominator` | integer | `5` | Time-signature denominator (1–16); also drives step duration: `quant = 60 / (bpm × denominator)`. |
| `octave` | integer | `6` | Octave shift (0–10): trit 0 addresses scale degree `octave × k`. |
| `sequence` | string | `"1 3 9 -1 -3 -9"` | Space-separated integers in balanced-ternary order. |
| `channel` | integer | `1` | MIDI channel 1–16. |

**Returns** a JSON object:
```json
{
  "filename": "SSeq9999-20260313T000000Z-5-35.05-90bpm-4on5timesig.mid",
  "midi_base64": "<base64-encoded MIDI bytes>",
  "steps": 6
}
```

#### `import_midi`

Recover a balanced-ternary sequence from a Standard MIDI file supplied as base64.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `midi_base64` | string | ✅ | Raw MIDI file bytes encoded as base64. |
| `forte` | string | | Forte number override; auto-detected when omitted. |
| `bpm` | integer | | BPM override for step-duration computation. |
| `denominator` | integer | | Denominator override for step-duration computation. |
| `octave` | integer | | Octave shift override (0–10); auto-detected when omitted. |
| `channels` | string | | Comma-separated 1-based MIDI channels, e.g. `"1,2"`. Empty = all channels. |
| `no_trim` | boolean | | Keep trailing zero steps when `true`. Default: `false`. |

**Returns** a JSON object:
```json
{
  "forte": "5-35.05",
  "octave": 6,
  "bpm": 90,
  "numerator": 4,
  "denominator": 5,
  "sequence": ["1", "3", "9", "-1", "-3", "-9"]
}
```

> **Note:** sequence values are serialised as strings to preserve BigInt precision beyond JavaScript's `Number.MAX_SAFE_INTEGER`.

