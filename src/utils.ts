
import { genMidiBuffer } from '../lib/mider'
import { Midi } from "@tonejs/midi";
import Synth from "./audiosynth";
import { Buffer } from "buffer";
import { Mp3Encoder } from "lamejs";

export type SynthNote = {
    note: string;
    octave: number;
    duration: number;
    time: number;
};

export function parseNoteName(name: string): { note: string; octave: number } {
    const match = name.match(/^([A-G]#?)(-?\d)$/);
    if (!match) throw new Error(`Invalid note name: ${name}`);
    return { note: match[1], octave: parseInt(match[2]) };
}

/**
 * 将 MIDI Buffer 中所有轨道合并并按时间排序为 SynthNote 列表
 * @param b MIDI 文件 Buffer
 */
export function midiBufferToSynthNotes(b: Buffer): SynthNote[] {
    const midi = new Midi(b);
    const notes: SynthNote[] = [];

    for (const track of midi.tracks) {
        for (const note of track.notes) {
            try {
                const { note: pitch, octave } = parseNoteName(note.name);
                notes.push({
                    note: pitch,
                    octave,
                    duration: note.duration,
                    time: note.time
                });
            } catch (e) {
                console.warn(`Skipping invalid note: ${note.name}`);
            }
        }
    }

    // 按时间升序排序，保证播放顺序准确
    return notes.sort((a, b) => a.time - b.time)
}

export function extractPCM(wav: Buffer): Buffer {
    return wav.slice(44); // remove WAV header
}

export function createWavHeader(
    dataLength: number,
    sampleRate = 44100,
    channels = 1,
    bitsPerSample = 16
): Buffer {
    const byteRate = sampleRate * channels * bitsPerSample / 8;
    const blockAlign = channels * bitsPerSample / 8;
    const buffer = Buffer.alloc(44);

    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write("WAVE", 8);
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write("data", 36);
    buffer.writeUInt32LE(dataLength, 40);

    return buffer;
}

/**
 * 生成指定长度的静音（WAV PCM格式）
 */
function generateSilence(seconds: number): Buffer {
    const sampleRate = 44100;
    const samples = Math.floor(seconds * sampleRate);
    const silence = Buffer.alloc(samples * 2); // 16-bit = 2 bytes
    return silence;
}

export function _synthNotesToWavBuffer_(notes: SynthNote[], instrumentName: string = 'piano'): Buffer {
    const instrument = Synth.createInstrument(instrumentName);
    const noteBuffers = notes.map(({ note, octave, duration }) => {
        // @ts-ignore
        return instrument.generate(note, octave, duration);
    });
    const pcmParts = noteBuffers.map(extractPCM);
    const allPCM = Buffer.concat(pcmParts);
    const header = createWavHeader(allPCM.length);
    return Buffer.concat([header, allPCM]);
}

/**
 * 将 SynthNote 列表合成为单个 WAV Buffer，支持时间对齐播放（多轨）
 * @param notes 包含 note/octave/duration/time 的音符列表
 * @param instrumentName 使用的乐器名（如 piano）
 * @returns WAV 文件 Buffer
 */
export function synthNotesToWavBuffer(notes: SynthNote[], instrumentName = 'piano'): Buffer {
    const instrument = Synth.createInstrument(instrumentName);
    const sampleRate = 44100;

    // 确保按时间排序
    const sorted = [...notes].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));

    const buffers: Buffer[] = [];
    let currentTime = 0;

    for (const { note, octave, duration, time = currentTime } of sorted) {
        const gap = time - currentTime;
        if (gap > 0) {
            buffers.push(generateSilence(gap));
        }

        // @ts-ignore
        const wav = instrument.generate(note, octave, duration);
        buffers.push(extractPCM(wav));
        currentTime = time + duration;
    }

    const allPCM = Buffer.concat(buffers);
    const header = createWavHeader(allPCM.length);
    return Buffer.concat([header, allPCM]);
}

export function wavToMp3(wavBuffer: Buffer): Buffer {
    const wavBody = wavBuffer.slice(44);
    const pcmSamples = new Int16Array(
        wavBody.buffer,
        wavBody.byteOffset,
        wavBody.length / 2
    );
    const mp3encoder = new Mp3Encoder(1, 44100, 128);
    const mp3buf = mp3encoder.encodeBuffer(pcmSamples);
    const mp3end = mp3encoder.flush();
    return Buffer.concat([Buffer.from(mp3buf), Buffer.from(mp3end)]);
}

export function midercodeToMp3Buffer(code: string): Buffer {
    const match = code.match(/i=([^\s;>]+)/)
    let instrument = 'piano'
    if (match && ['piano', 'organ', 'acoustic', 'edm'].some(i=>i==match[1])) {
        instrument = match[1]
        code = code.replace(/i=([^\s;>]+)/, '')
    }

    const midiBuffer = Buffer.from(genMidiBuffer(code))
    const notes = midiBufferToSynthNotes(midiBuffer)
    const wav = synthNotesToWavBuffer(notes, instrument)
    return wavToMp3(wav);
}
