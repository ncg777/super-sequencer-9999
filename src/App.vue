<template>  
	<v-app>
		<AdjacencyMatrix class="shader-bg" :notes="activeNotes" :size="128" :flowWeight="2.0" :harmonyWeight="1.0" :decay="0.95" :minNote="noteRange.min" :maxNote="noteRange.max" />
		<v-main>
		  <v-responsive class="align-center mx-auto pa-4 pb-8" max-width="900">
			<h1>Super Sequencer 9999
      <v-btn 
          icon 
          @click="showHelp = true" 
          class="help-button"
        >
          <v-icon>mdi-help-circle</v-icon>
        </v-btn>
      </h1>
			<v-row>
        <v-col cols="6">
          <v-autocomplete
            label="Forte number"
            v-model="forte"
            :items="allChords"
            placeholder="Forte number..."
            @update:modelValue="saveSettingsToLocalStorage"
          />
				</v-col>
        <v-col cols="6">
          <v-select v-model="waveform" label="Waveform" :items="['sine','square','triangle','sawtooth']" @update:modelValue="saveSettingsToLocalStorage" />
			  </v-col>
			</v-row>
      <v-row>
        <v-col cols="12">
				  <v-text-field 
            :label="`Sequence (${sequence.length})`"
            v-model="sequenceInput" 
            placeholder="e.g. 0 1 2..." 
            @update:modelValue="saveSettingsToLocalStorage" />
				</v-col>
      </v-row>
			<v-row class="compact-row">
			  <v-col cols="12">
          <v-slider :label="'Tempo (' + bpm + ' BPM)'" min=1 step=1 max=499 v-model.number="bpm" @update:modelValue="saveSettingsToLocalStorage" />
				</v-col>
      </v-row>
      <v-row class="compact-row">
        <v-col colr="12">
          <v-slider :label="'Numerator (' + numerator + ')'" min=1 step=1 max=16 v-model.number="numerator" @update:modelValue="saveSettingsToLocalStorage" />
				</v-col>
      </v-row>
      <v-row class="compact-row">
			  <v-col cols="12">
				  <v-slider :label="'Denominator ('+ denominator + ')'" min=1 step=1 max=16 v-model.number="denominator" @update:modelValue="saveSettingsToLocalStorage" />
				</v-col>
			</v-row>
      <v-row class="compact-row">
        <v-col cols="12">
				  <v-slider :label="'Octave shift ('+ octave + ')'" min=0 step=1 max=10 v-model.number="octave" @update:modelValue="saveSettingsToLocalStorage" />
				</v-col>
      </v-row>

      
      <v-row>
        <v-col cols="4">
          <v-switch 
            v-model="useMidiOutput" 
            label="MIDI" 
            @update:modelValue="updateMidiMode"
          />
        </v-col>
        <v-col cols="4" v-if="useMidiOutput">
          <v-select 
            v-model="selectedMidiDevice" 
            :items="midiDevices" 
            label="MIDI Device" 
            @update:modelValue="updateMidiDevice"
          />
        </v-col>
        <v-col cols="4" v-if="useMidiOutput">
          <v-slider 
            :label="'Channel (' + midiChannel + ')'" 
            min="1" 
            max="16" 
            step="1" 
            v-model.number="midiChannel"
          />
        </v-col>
      </v-row>
      
			<button @click="toggleSequencer" class="stopplay">{{ isRunning ? '⏹️' : '▶️' }}</button>
      <button @click="allNotesOff" class="userbutton">🔇 All Notes Off</button>
      <button @click="copyURL" class="userbutton">📋Copy URL</button>
			<button @click="downloadMIDI" class="downloadmidi">Download MIDI</button>
      <br />
      <br />
      <!-- Help Modal -->
      
		  </v-responsive>
      <!-- Help Modal -->
      <v-dialog v-model="showHelp" max-width="800px">
          <v-card class="pa-4 bg-black">
            <v-card-title class="pa-4">
              <span class="text-h5 font-weight-bold">Super Sequencer 9999 <small style="font-size:0.6em; color:#888; margin-left:1em;">v{{ appVersion }}</small></span>
              <v-spacer></v-spacer>
              <v-btn icon @click="showHelp = false" class="close-btn">
                <v-icon>mdi-close</v-icon>
              </v-btn>
            </v-card-title>
            <v-divider></v-divider>
            <v-card-text class="pa-4">
              <h4 class="mb-2">How the Sequencer Works</h4>
              <p>The sequencer allows you to customize the following parameters:</p>
              <ul>
                <li><strong>Forte number</strong>: The pitch-class set to use as Forte number with transposition (see
                  <a target="_blank" href="https://en.wikipedia.org/wiki/List_of_set_classes">Forte numbers</a>).</li>
                <li><strong>BPM</strong>: Controls the tempo of the sequence.</li>
                <li><strong>Numerator</strong>: The top number of the time signature.</li>
                <li><strong>Denominator</strong>: The bottom number of the time signature.</li>
                <li><strong>Waveform</strong>: Select from sine, square, triangle, or sawtooth waveforms.</li>
                <li><strong>Sequence</strong>: Input a sequence of integers. Each integer is interpreted in <em>balanced ternary</em>; each trit (ternary digit) maps to a scale degree and acts as a MIDI note-on, note-off, or no-op.</li>
                <li><strong>Octave Shift</strong>: Adjusts which scale degree the least-significant trit (position 0) maps to. Specifically, trit 0 maps to scale degree <code>octave_shift × k</code>, where <code>k</code> is the cardinality of the pitch-class set.</li>
              </ul>

              <h3 class="mt-4 mb-2">Balanced Ternary Encoding</h3>
              <p>Every integer has a unique representation in <em>balanced ternary</em> (base 3 with digits <strong>{-1, 0, 1}</strong>). The value is computed as:</p>
              <p style="text-align:center;"><code>value = ∑ trit<sub>i</sub> × 3<sup>i</sup></code></p>

              <h4 class="mt-3 mb-1">Conversion Examples</h4>
              <table style="border-collapse:collapse; width:100%; margin-bottom:12px;">
                <thead><tr style="border-bottom:1px solid #555;">
                  <th style="text-align:left; padding:4px 8px;">Integer</th>
                  <th style="text-align:left; padding:4px 8px;">Balanced Ternary (trit₀ trit₁ …)</th>
                  <th style="text-align:left; padding:4px 8px;">Effect on scale degrees</th>
                </tr></thead>
                <tbody>
                  <tr><td style="padding:4px 8px;"><code>0</code></td><td style="padding:4px 8px;"><code>[0]</code></td><td style="padding:4px 8px;">No operation — all notes unchanged</td></tr>
                  <tr><td style="padding:4px 8px;"><code>1</code></td><td style="padding:4px 8px;"><code>[1]</code></td><td style="padding:4px 8px;">Note ON for degree 0</td></tr>
                  <tr><td style="padding:4px 8px;"><code>-1</code></td><td style="padding:4px 8px;"><code>[-1]</code></td><td style="padding:4px 8px;">Note OFF for degree 0</td></tr>
                  <tr><td style="padding:4px 8px;"><code>3</code></td><td style="padding:4px 8px;"><code>[0, 1]</code></td><td style="padding:4px 8px;">Note ON for degree 1</td></tr>
                  <tr><td style="padding:4px 8px;"><code>-3</code></td><td style="padding:4px 8px;"><code>[0, -1]</code></td><td style="padding:4px 8px;">Note OFF for degree 1</td></tr>
                  <tr><td style="padding:4px 8px;"><code>4</code></td><td style="padding:4px 8px;"><code>[1, 1]</code></td><td style="padding:4px 8px;">Note ON for degrees 0 and 1</td></tr>
                  <tr><td style="padding:4px 8px;"><code>13</code></td><td style="padding:4px 8px;"><code>[1, 1, 1]</code></td><td style="padding:4px 8px;">Note ON for degrees 0, 1, and 2</td></tr>
                  <tr><td style="padding:4px 8px;"><code>-13</code></td><td style="padding:4px 8px;"><code>[-1, -1, -1]</code></td><td style="padding:4px 8px;">Note OFF for degrees 0, 1, and 2</td></tr>
                  <tr><td style="padding:4px 8px;"><code>5</code></td><td style="padding:4px 8px;"><code>[-1, -1, 1]</code></td><td style="padding:4px 8px;">Note OFF for degrees 0 1, Note ON for degree 2</td></tr>
                </tbody>
              </table>

              <h4 class="mt-3 mb-1">Trit-to-MIDI-Pitch Mapping</h4>
              <ol>
                <li><strong>Scale construction:</strong> The chosen pitch-class set (Forte number) is expanded across all MIDI octaves (0–127), producing an ordered list of scale degrees.</li>
                <li><strong>Octave shift:</strong> Trit position <code>i</code> addresses scale degree <code>octave_shift × k + i</code>, where <code>k</code> is the set cardinality. Trits that fall outside the scale range are ignored.</li>
                <li><strong>Trit semantics at each step:</strong>
                  <ul>
                    <li><code>+1</code> &rarr; <strong>Note ON</strong> — the MIDI pitch at that scale degree begins sounding. If it is already on, it is retriggered.</li>
                    <li><code>-1</code> &rarr; <strong>Note OFF</strong> — the MIDI pitch at that scale degree is released.</li>
                    <li><code>&nbsp;0</code> &rarr; <strong>No-op</strong> — the note keeps its current state (on or off).</li>
                  </ul>
                </li>
                <li><strong>Stateful playback:</strong> Notes accumulate: an ON persists until an explicit OFF appears in a later step. This allows sustain, overlapping voices, and precise rhythmic control.</li>
              </ol>

              <h4 class="mt-3 mb-1">Integer Limits</h4>
              <p>Sequence integers are parsed as arbitrary-precision values (BigInt). The practical limit is determined by the scale size:</p>
              <ul>
                <li>A scale with <strong>N</strong> degrees requires at most <strong>N</strong> trits.</li>
                <li>The maximum meaningful integer magnitude is <code>(3<sup>N</sup> − 1) / 2</code>.</li>
                <li>For a chromatic set (k=12): N ≈ 128 ⇒ max ≈ ±5.7 × 10<sup>60</sup>.</li>
                <li>For a pentatonic set (k=5): N ≈ 55 ⇒ max ≈ ±7.4 × 10<sup>25</sup>.</li>
                <li>Trits beyond position N are simply ignored.</li>
              </ul>

              <h4 class="mt-3 mb-1">Quick Reference</h4>
              <p>Powers of 3 are the building blocks: <code>3<sup>i</sup></code> turns on exactly scale degree <code>i</code>, and <code>-3<sup>i</sup></code> turns it off. Sums and differences combine operations. <code>0</code> is a rest/hold step.</p>
            </v-card-text>
            <v-divider></v-divider>
            <v-card-actions class="pa-4">
              <v-spacer></v-spacer>
              <v-btn color="primary" @click="showHelp = false">Close</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </v-main>
  </v-app>
</template>

<script lang="ts">
import pkg from '../package.json';
const appVersion = pkg.version;
import { defineComponent, markRaw, ref } from 'vue';
import AdjacencyMatrix from './components/AdjacencyMatrix.vue';
import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';
import { PCS12 } from 'ultra-mega-enumerator';

/**
 * Convert an integer to balanced ternary.
 * Returns an array of trits (-1, 0, 1) from least-significant to most-significant.
 * value = sum( trit[i] * 3^i )
 */
function toBalancedTernary(n: bigint): number[] {
  if (n === 0n) return [0];
  const trits: number[] = [];
  let v = n;
  while (v !== 0n) {
    let r = Number(((v % 3n) + 3n) % 3n); // normalize remainder to 0, 1, or 2
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

export default defineComponent({
  name: 'App',
  components: {
    AdjacencyMatrix
  },
  data() {
    const params = new URLSearchParams(window.location.search);
    
    return {
      bpm: parseInt(params.get("bpm") ?? localStorage.getItem("ss9999_bpm")?? "90") ,
      numerator: parseInt(params.get("numerator") ?? localStorage.getItem("ss9999_numerator")?? "4"),
      denominator: parseInt(params.get("denominator") ?? localStorage.getItem("ss9999_denominator") ?? "5"),
      waveform: params.get("waveform") ?? localStorage.getItem("ss9999_waveform") ?? "sine",
      sequenceInput: params.get("sequence") ?? localStorage.getItem("ss9999_sequence") ?? '1 3 9 -1 -3 -9',
      octave: parseInt(params.get("octave") ?? localStorage.getItem("ss9999_octave") ?? "6"),
      allChords: [] as string[],
      isRunning: false,
      loop: null as Tone.Loop|null,
      forte: params.get("forte") ?? localStorage.getItem("ss9999_forte") ?? "5-35.05",
      counter: 0,
      showHelp: false,
      limiter: markRaw(new Tone.WaveShaper((x: number) => Math.tanh(x)).toDestination()),
      synth: markRaw(new Tone.PolySynth(Tone.Synth).toDestination()),
      useMidiOutput: false,
      midiDevices: [] as string[],
      selectedMidiDevice: null,
      midiChannel: 1,
      midiAccess: null as MIDIAccess | null,
      midiOutput: null as MIDIOutput | null,
      appVersion: appVersion,
      pnowMs: -1,
      transportnowMs:-1,
      activeNotes: [] as number[]
    };
  },
  computed: {
    synth():Tone.PolySynth {
      const o = markRaw(new Tone.PolySynth(Tone.Synth,{
          envelope:{
            attackCurve: 'exponential',
            attack: (this.quant/2.0).toString()+"s",
            decay:0,
            releaseCurve: 'exponential',
            release: (this.quant/2.0).toString()+"s",
            sustain: 1.0
          },
          oscillator: {
                type: 
                  this.waveform === "triangle" ? 'triangle' : 
                    this.waveform === "sawtooth" ? 'sawtooth' : 
                      this.waveform === "square" ? 'square' : 'sine1'
          }
        }).connect(this.limiter));
        // Use a small lookAhead so playback feels immediate while keeping scheduling stable
        o.context.lookAhead = 0.05;
        return o;
    },
    noteRange(): { min: number, max: number } {
      const allNotes: number[] = [];
      for (const step of this.tritEvents) {
        allNotes.push(...step.noteOns, ...step.noteOffs);
      }
      if (allNotes.length === 0) return { min: 0, max: 127 };
      const min = Math.min(...allNotes);
      const max = Math.max(...allNotes);
      const padding = Math.max(3, Math.floor((max - min) * 0.1));
      return { 
        min: Math.max(0, min - padding), 
        max: Math.min(127, max + padding) 
      };
    },
    quant() {return 60.0/(this.bpm*this.denominator);},
    sequence(): bigint[] {
      return this.sequenceInput
        .split(/\s+/)
        .map((s:string) => s.trim())
        .filter((s:string) => s.length > 0)
        .map((s:string) => { try { return BigInt(s); } catch { return null; } })
        .filter((n): n is bigint => n !== null);
    },
    scale(): number[] {
      const s = PCS12.parseForte(this.forte);
      const p = s?.asSequence()||[];
      const o = [];
      
      for(const n of p) {
        for(let i=0;i<=10;i++) {
          const t = n+(12*i);
          if(t < 128) o.push(t);
        }
      }
      o.sort((a,b) => a-b);
      return o; 
    },
    /**
     * Compute balanced-ternary note-on / note-off events for every step.
     * Each step maps its integer to trits; each trit position addresses a scale degree.
     */
    tritEvents(): { noteOns: number[], noteOffs: number[] }[] {
      const s = PCS12.parseForte(this.forte);
      if (!s) return [];
      const k = s?.getK() ?? 0;
      const baseIdx = this.octave * k;

      return this.sequence.map(
        (n: bigint) => {
          const trits = toBalancedTernary(n);
          const noteOns: number[] = [];
          const noteOffs: number[] = [];

          for (let t = 0; t < trits.length; t++) {
            const trit = trits[t];
            if (trit === 0) continue;
            const scaleIdx = baseIdx + t;
            if (scaleIdx < 0 || scaleIdx >= this.scale.length) continue;
            const midiNote = this.scale[scaleIdx];
            if (trit === 1) {
              noteOns.push(midiNote);
            } else if (trit === -1) {
              noteOffs.push(midiNote);
            }
          }

          return { noteOns, noteOffs };
        });
    },
  },
  methods: {
    formattedDate() {
      return (timestamp => `${new Date(timestamp).getUTCFullYear()}${String(new Date(timestamp).getUTCMonth() + 1).padStart(2, '0')}${String(new Date(timestamp).getUTCDate()).padStart(2, '0')}T${String(new Date(timestamp).getUTCHours()).padStart(2, '0')}${String(new Date(timestamp).getUTCMinutes()).padStart(2, '0')}${String(new Date(timestamp).getUTCSeconds()).padStart(2, '0')}Z`)(Date.now());
    },
    async initializeMidi() {
      try {
        const access = await navigator.requestMIDIAccess();
        this.midiAccess = access;
        
        this.midiDevices = Array.from(access.outputs.values()).map(output => output.name!);
      } catch (error) {
        console.error("Failed to initialize MIDI:", error);
      }
    },
    updateMidiDevice() {
      const device = Array.from(this.midiAccess?.outputs.values() || []).find(output => output.name === this.selectedMidiDevice);
      this.midiOutput = device || null;
    },
    updateMidiMode() {
      if (this.useMidiOutput) {
        this.initializeMidi();
      } else {
        //this.midiOutput = null;
      }
    },
    async playNoteWithMidi(noteOn: boolean, note: number, velocity: number, when: number) {
      if (this.midiOutput!!) {
          const ctxNow = Tone.now();
          const nowMs = performance.now();
          const delayMs = Math.max(0, (when - ctxNow) * 1000);
          const timeMs = nowMs + delayMs;

          if (noteOn) {
            this.midiOutput!.send([0x90 + this.midiChannel-1, note, Math.round(velocity * 127)], timeMs);
          } else {
            this.midiOutput!.send([0x80 + this.midiChannel-1, note, 0], timeMs);
          }
      }
    },
    updateSynth() {
      const waveformType = 
        this.waveform === "triangle" ? 'triangle' :
        this.waveform === "sawtooth" ? 'sawtooth' :
        this.waveform === "square" ? 'square' : 'sine';

      // Disconnect from any prior destination and route through tanh waveshaper
      this.synth.disconnect();
      this.synth.connect(this.limiter);

      this.synth.set({
        envelope: {
          attackCurve: 'exponential',
          attack: (this.quant / 2.0).toString() + "s",
          decay: 0,
          releaseCurve: 'exponential',
          release: (this.quant / 2.0).toString() + "s",
          sustain: 1.0
        },
        oscillator: {
          type: waveformType
        }
      });
      
      // Use a small lookAhead for a snappier start
      this.synth.context.lookAhead = 0.05;
    },
    async getMidi():Promise<Midi> {
      const midi = new Midi();
      const track = midi.addTrack();
      track.channel = this.useMidiOutput ? this.midiChannel-1 : 0;
      
      midi.header.setTempo(this.bpm);

      const events = this.tritEvents;
      const activeOnTimes = new Map<number, number>(); // note -> onset time

      for (let i = 0; i < events.length; i++) {
        const time = i * this.quant;
        const step = events[i];

        // Close retriggered notes first
        for (const note of step.noteOns) {
          const onTime = activeOnTimes.get(note);
          if (onTime !== undefined) {
            track.addNote({ midi: note, time: onTime, duration: time - onTime, velocity: 0.5 });
            activeOnTimes.delete(note);
          }
        }

        // Process note offs
        for (const note of step.noteOffs) {
          const onTime = activeOnTimes.get(note);
          if (onTime !== undefined) {
            track.addNote({ midi: note, time: onTime, duration: time - onTime, velocity: 0.5 });
            activeOnTimes.delete(note);
          }
        }

        // Process note ons
        for (const note of step.noteOns) {
          activeOnTimes.set(note, time);
        }
      }

      // Close any remaining active notes at end of sequence
      const endTime = events.length * this.quant;
      for (const [note, onTime] of activeOnTimes) {
        track.addNote({ midi: note, time: onTime, duration: endTime - onTime, velocity: 0.5 });
      }
      
      return midi;
    },
    async toggleSequencer() {
      if (this.isRunning) {
        this.stopSequencer();
      } else {
        this.startSequencer();
      }
    },
    async copyURL() {
      await navigator.clipboard.writeText(encodeURI(`https://ncg777.github.io/super-sequencer-9999?bpm=${this.bpm}&numerator=${this.numerator}&denominator=${this.denominator}&waveform=${this.waveform}&octave=${this.octave}&forte=${this.forte}&sequence=${this.sequenceInput}`));
      window.alert("URL copied to clipboard.");
    },
    async startSequencer() {
      if(this.isRunning) return;
      this.isRunning = true;
      this.counter = 0;
      this.activeNotes = [];
      await Tone.start();
      this.updateSynth();
      console.log('Audio context started');
      this.saveSettingsToLocalStorage();
      const that = this;
      if(this.loop == null) {
        this.loop = new Tone.Loop(async (_) => {
          that.playNote(_, that.counter);
          that.counter = (that.counter + 1) % that.tritEvents.length; 
        }, this.quant.toString()+"s");
      }
      
      // Start loop and transport immediately; schedule from now without artificial offsets
      this.loop.start(0);
      Tone.getTransport().seconds = 0;
      Tone.getTransport().start();
    },
    /**
     * Immediately release every sounding note without stopping the sequencer.
     */
    allNotesOff() {
      if (this.activeNotes.length === 0) return;
      if (this.useMidiOutput && this.midiOutput) {
        for (const note of this.activeNotes) {
          this.midiOutput.send([0x80 + this.midiChannel - 1, note, 0]);
        }
      } else if (this.synth) {
        this.synth.triggerRelease(
          this.activeNotes.map(n => Tone.Frequency(n, 'midi').toFrequency())
        );
      }
      this.activeNotes = [];
    },
    stopSequencer() {
      if(!this.isRunning) return;
      this.isRunning = false;
      this.loop?.stop();
      this.allNotesOff();
      Tone.getTransport().stop();
      Tone.getTransport().seconds=0;
      console.log('Stopped');
    },
    
    saveSettingsToLocalStorage() {
      localStorage.setItem("ss9999_bpm", this.bpm.toString());
      localStorage.setItem("ss9999_numerator", this.numerator.toString());
      localStorage.setItem("ss9999_denominator", this.denominator.toString());
      localStorage.setItem("ss9999_octave", this.octave.toString());
      localStorage.setItem("ss9999_waveform", this.waveform);
      localStorage.setItem("ss9999_sequence", this.sequenceInput);
      localStorage.setItem("ss9999_forte", this.forte);
      if(!!this.loop){
        this.loop.interval=this.quant.toString()+"s";
      }
      Tone.getTransport().bpm.value = this.bpm;
      Tone.getTransport().timeSignature = [this.numerator,this.denominator];
      this.updateSynth();
    },
    
    async playNote(when : Tone.Unit.Seconds, counter:number) {
      const step = this.tritEvents[counter % this.tritEvents.length];
      if (!step) return;

      // Build set of currently active notes
      const activeSet = new Set(this.activeNotes);

      // Notes to release: explicit offs + retriggers (on for already-active notes)
      const toRelease: number[] = [];
      for (const note of step.noteOffs) {
        if (activeSet.has(note)) {
          toRelease.push(note);
          activeSet.delete(note);
        }
      }
      for (const note of step.noteOns) {
        if (activeSet.has(note)) {
          toRelease.push(note); // retrigger
        }
        activeSet.add(note);
      }

      this.activeNotes = Array.from(activeSet).sort((a, b) => a - b);
      console.log('Step events:', step, 'Active:', this.activeNotes);

      // Scale velocity by the total number of active notes to prevent clipping.
      // Uses 1/sqrt(N) scaling (equal-power) clamped to [0.05, 0.8].
      const totalActive = Math.max(1, this.activeNotes.length);
      const vel = Math.min(0.8, Math.max(0.05, 0.6 / Math.sqrt(totalActive)));

      if (this.useMidiOutput && this.midiOutput) {
        for (const note of toRelease) {
          this.playNoteWithMidi(false, note, 0, when);
        }
        for (const note of step.noteOns) {
          this.playNoteWithMidi(true, note, vel, when);
        }
      } else if (this.synth) {
        if (toRelease.length > 0) {
          this.synth.triggerRelease(
            toRelease.map(n => Tone.Frequency(n, 'midi').toFrequency()),
            when
          );
        }
        if (step.noteOns.length > 0) {
          this.synth.triggerAttack(
            step.noteOns.map(n => Tone.Frequency(n, 'midi').toFrequency()),
            when,
            vel
          );
        }
      }
    },

    async downloadMIDI() {
      const data = (await this.getMidi()).toArray();
      const blob = new Blob([data.buffer as ArrayBuffer], { type: 'audio/midi' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `SSeq9999-${this.formattedDate().toString()}-${this.forte}-${this.bpm}bpm-${this.numerator}on${this.denominator}timesig.mid`;
      a.click();

      // Clean up the URL object
      URL.revokeObjectURL(url);
    }
  },
  async beforeMount() {
      await PCS12.init();
      const arr = Array.from(PCS12.getChords()).map(c => c.toString());
      arr.sort(PCS12.ReverseForteStringComparator);
      this.allChords=arr;
      this.updateSynth();
  },
  beforeUnmount() {
    this.stopSequencer();
    this.synth.dispose();
    this.limiter.dispose();
  },
  async onMounted() {
    this.saveSettingsToLocalStorage();
    if (this.useMidiOutput) {
      await this.initializeMidi();
  }
  }
});
</script>

<style scoped>
.shader-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
}

:deep(.v-application) {
  background: transparent !important;
}

:deep(.v-main) {
  background: transparent !important;
  position: relative;
  z-index: 1;
}

:deep(.v-responsive) {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 16px;
  padding: 16px;
}

:deep(.v-label),
:deep(.v-field__input),
:deep(.v-select__selection-text),
:deep(.v-autocomplete__selection-text) {
  color: #ffffff !important;
}
h1 {
  text-align: center;
  margin-bottom: 16pt;
  color: #ffffff;
}

.downloadmidi,
.userbutton,
.stopplay {
  color: #ffffff;
}

.downloadmidi {
  padding: 10px;
  font-size: 18px;
  width: 100%;
}
.userbutton {
  padding: 10px;
  font-size: 18px;
  width: 100%;
}
.stopplay {
  padding: 2px;
  font-size: 50px;
  width: 100%;
  margin-bottom: 5px;
}
.close-btn {
    position: absolute;
    top: 16px;
    right: 16px;
}
.compact-row * {
  padding:0;
  margin-bottom: 0;
  margin-top: 0;
}
</style>