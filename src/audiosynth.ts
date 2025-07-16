// from https://github.com/keithwhor/audiosynth/blob/master/audiosynth.js

/** 音符名称 */
type Note = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

/** 声音ID，可以是数字索引或乐器名称 */
type SoundID = number | string;

/** 调制函数 */
type ModulationFunction = (i: number, sampleRate: number, frequency: number, x?: any) => number;

/** `wave` 函数的 `this` 上下文类型 */
interface WaveFunctionContext {
    modulate: ModulationFunction[];
    vars: Record<string, any>;
}

/**
 * 定义一个乐器音色的配置
 */
export interface SoundProfile {
    /** 乐器名称 */
    name: string;
    /** Attack 时间函数：返回音量包络的起音时间（秒） */
    attack: (sampleRate?: number, frequency?: number, volume?: number) => number;
    /** Dampen 衰减函数：返回音量包络的衰减强度 */
    dampen: (sampleRate?: number, frequency?: number, volume?: number) => number;
    /** Wave 波形函数：生成每个采样点的波形数据 */
    wave: (this: WaveFunctionContext, i: number, sampleRate: number, frequency: number, volume?: number) => number;
}


// ----------------- AudioSynthInstrument 类 -----------------

/**
 * 代表一个可播放的乐器实例
 * @class AudioSynthInstrument
 */
export class AudioSynthInstrument {
    private readonly _parent: AudioSynth;
    public readonly name: string;
    private readonly _soundID: number;

    /**
     * @param {AudioSynth} parent - AudioSynth 的父实例
     * @param {string} name - 乐器名称
     * @param {number} soundID - 乐器在 AudioSynth 中的索引
     */
    constructor(parent: AudioSynth, name: string, soundID: number) {
        this._parent = parent;
        this.name = name;
        this._soundID = soundID;
    }

    /**
     * 播放一个音符
     * @param {Note} note - 要播放的音符
     * @param {number} octave - 音符所在的八度
     * @param {number} duration - 持续时间（秒）
     * @returns {HTMLAudioElement} - 返回创建的 Audio 元素
     */
    public play(note: Note, octave: number, duration: number): HTMLAudioElement {
        return this._parent.play(this._soundID, note, octave, duration);
    }

    /**
     * 生成一个音符的音频数据
     * @param {Note} note - 要生成的音符
     * @param {number} octave - 音符所在的八度
     * @param {number} duration - 持续时间（秒）
     * @returns {Buffer} - 返回包含 WAV 音频数据的 Buffer
     */
    public generate(note: Note, octave: number, duration: number): Buffer {
        return this._parent.generate(this._soundID, note, octave, duration);
    }
}


// ----------------- AudioSynth 主类 -----------------

/**
 * 核心音频合成类
 * @class AudioSynth
 */
export class AudioSynth {
    private _debug = false;
    private _bitsPerSample = 16;
    private _channels = 1;
    private _sampleRate = 44100;
    private _volume = 32767; // Max value for 16-bit audio

    private readonly _notes: Record<Note, number> = {
        'C': 261.63, 'C#': 277.18, 'D': 293.66, 'D#': 311.13, 'E': 329.63, 'F': 349.23,
        'F#': 369.99, 'G': 392.00, 'G#': 415.30, 'A': 440.00, 'A#': 466.16, 'B': 493.88
    };

    private _sounds: SoundProfile[] = [];
    private _mod: ModulationFunction[] = [(i, s, f, x) => Math.sin((2 * Math.PI) * (i / s) * f + x)];

    // 缓存结构: [soundIndex][octave-1][note][duration]
    private _fileCache: Array<Array<Partial<Record<Note, Record<number, Buffer>>>>> = [];
    private _temp: Record<string, any> = {};

    constructor() {
        this._resizeCache();
    }

    /**
     * 设置采样率
     * @param {number} sampleRate - 新的采样率 (4000-44100)
     * @returns {number} - 最终设置的采样率
     */
    public setSampleRate(sampleRate: number): number {
        this._sampleRate = Math.max(Math.min(sampleRate | 0, 44100), 4000);
        this._clearCache();
        return this._sampleRate;
    }

    public getSampleRate(): number {
        return this._sampleRate;
    }

    /**
     * 设置音量
     * @param {number} volume - 音量值 (0.0 to 1.0)
     * @returns {number} - 最终设置的内部音量值
     */
    public setVolume(volume: number): number {
        const v = parseFloat(String(volume));
        this._volume = Math.round(Math.max(0, Math.min(1, isNaN(v) ? 0 : v)) * 32767);
        this._clearCache();
        return this._volume;
    }

    public getVolume(): number {
        return Math.round((this._volume / 32767) * 10000) / 10000;
    }

    /**
     * 开启调试模式，将在控制台输出生成时间
     */
    public debug(): void {
        this._debug = true;
    }

    /**
     * 加载一个或多个乐器音色配置
     * @param {...SoundProfile[]} profiles - 要加载的音色配置
     */
    public loadSoundProfile(...profiles: SoundProfile[]): void {
        profiles.forEach(profile => {
            if (!(profile instanceof Object)) {
                throw new Error('Invalid sound profile.');
            }
            this._sounds.push(profile);
        });
        this._resizeCache();
    }

    /**
     * 加载一个或多个调制函数
     * @param {...ModulationFunction[]} functions - 要加载的调制函数
     */
    public loadModulationFunction(...functions: ModulationFunction[]): void {
        functions.forEach(fn => {
            if (typeof fn !== 'function') {
                throw new Error('Invalid modulation function.');
            }
            this._mod.push(fn);
        });
    }

    /**
     * 创建一个乐器实例
     * @param {SoundID} sound - 乐器名称或ID
     * @returns {AudioSynthInstrument} - 乐器实例
     */
    public createInstrument(sound: SoundID): AudioSynthInstrument {
        const soundID = this._findSound(sound);
        if (soundID === -1) {
            throw new Error(`Invalid sound or sound ID: ${sound}`);
        }
        const name = this._sounds[soundID].name;
        return new AudioSynthInstrument(this, name, soundID);
    }

    /**
     * 列出所有已加载的乐器名称
     * @returns {string[]}
     */
    public listSounds(): string[] {
        return this._sounds.map(s => s.name);
    }
    generate(sound: SoundID, note: Note, octave: number, duration: number): Buffer {
        const soundID = this._findSound(sound);
        const thisSound = this._sounds[soundID];
        if (!thisSound) {
            throw new Error(`Invalid sound or sound ID: ${sound}`);
        }

        const t = Date.now();
        this._temp = {};

        const o = Math.min(8, Math.max(1, octave | 0));
        const d = !duration ? 2 : parseFloat(String(duration));

        if (!this._notes[note]) {
            throw new Error(`'${note}' is not a valid note.`);
        }

        const cached = this._fileCache[soundID]?.[o - 1]?.[note]?.[d];
        if (cached) {
            if (this._debug) { console.log(`Retrieve from cache: ${Date.now() - t}ms`); }
            return cached;
        }

        const frequency = this._notes[note] * Math.pow(2, o - 4);
        const sampleRate = this._sampleRate;
        const volume = this._volume;

        const attack = thisSound.attack(sampleRate, frequency, volume);
        const dampen = thisSound.dampen(sampleRate, frequency, volume);
        const waveFunc = thisSound.wave;
        const waveBind: WaveFunctionContext = { modulate: this._mod, vars: this._temp };

        const attackLen = (sampleRate * attack) | 0;
        const decayLen = (sampleRate * d) | 0;

        // 16-bit, so 2 bytes per sample
        const dataSize = Math.ceil(decayLen * this._channels * (this._bitsPerSample / 8));
        const buffer = new ArrayBuffer(dataSize);
        const data = new Int16Array(buffer);

        let val = 0;
        let i = 0;

        // Attack
        for (i = 0; i < attackLen; i++) {
            val = volume * (i / (sampleRate * attack)) * waveFunc.call(waveBind, i, sampleRate, frequency, volume);
            data[i] = val | 0;
        }

        // Decay
        for (; i < decayLen; i++) {
            val = volume * Math.pow(1 - (i - attackLen) / (sampleRate * (d - attack)), dampen) * waveFunc.call(waveBind, i, sampleRate, frequency, volume);
            data[i] = val | 0;
        }

        const wavBuffer = this._createWav(Buffer.from(data.buffer));

        // Cache the result
        if (!this._fileCache[soundID][o - 1]) {
            this._fileCache[soundID][o - 1] = {};
        }
        if (!this._fileCache[soundID][o - 1][note]) {
            this._fileCache[soundID][o - 1][note] = {};
        }
        this._fileCache[soundID][o-1]![note]![d] = wavBuffer;

        if (this._debug) { console.log(`Generated in ${Date.now() - t}ms`); }

        return wavBuffer;
    }

    /**
     * 播放音符。
     * 注意: 此函数在浏览器环境中工作，通过创建 Data URI 和 Audio 元素。
     * 在 Node.js 环境中，它不会发出声音，但会返回一个 Audio 伪对象。
     * @param {SoundID} sound - 乐器ID或名称
     * @param {Note} note - 音符
     * @param {number} octave - 八度
     * @param {number} duration - 持续时间
     * @returns {HTMLAudioElement}
     */
    public play(sound: SoundID, note: Note, octave: number, duration: number): HTMLAudioElement {
        const buffer = this.generate(sound, note, octave, duration);
        const dataURI = 'data:audio/wav;base64,' + buffer.toString('base64');
        const audio = new Audio(dataURI);
        audio.play();
        return audio;
    }


    // ----------------- 私有辅助方法 -----------------

    /** 清空缓存 */
    private _clearCache(): void {
        this._fileCache = [];
        this._resizeCache();
    }

    /** 根据已加载的乐器数量重置缓存大小 */
    private _resizeCache(): void {
        const f = this._fileCache;
        while (f.length < this._sounds.length) {
            const octaveList: Array<Partial<Record<Note, Record<number, Buffer>>>> = [];
            for (let i = 0; i < 8; i++) {
                const noteList: Partial<Record<Note, Record<number, Buffer>>> = {};
                octaveList.push(noteList);
            }
            f.push(octaveList);
        }
    }

    /**
     * 查找乐器在 `_sounds` 数组中的索引
     * @param {SoundID} sound - 乐器名称或ID
     * @returns {number} - 找到的索引，未找到则返回 -1
     */
    private _findSound(sound: SoundID | string): number {
        if (typeof sound === 'string') {
            return this._sounds.findIndex(s => s.name === sound);
        } else if (typeof sound === 'number' && this._sounds[sound]) {
            return sound;
        }
        return -1;
    }

    /**
     * 创建WAV文件头并与音频数据拼接
     * @param {Buffer} data - PCM 音频数据
     * @returns {Buffer} - 完整的WAV文件Buffer
     */
    private _createWav(data: Buffer): Buffer {
        const sampleRate = this._sampleRate;
        const channels = this._channels;
        const bitsPerSample = this._bitsPerSample;
        const dataLength = data.length;

        const buffer = Buffer.alloc(44);

        // RIFF header
        buffer.write('RIFF', 0);
        buffer.writeUInt32LE(36 + dataLength, 4);
        buffer.write('WAVE', 8);

        // fmt sub-chunk
        buffer.write('fmt ', 12);
        buffer.writeUInt32LE(16, 16); // Sub-chunk size
        buffer.writeUInt16LE(1, 20); // Audio format (1 for PCM)
        buffer.writeUInt16LE(channels, 22);
        buffer.writeUInt32LE(sampleRate, 24);
        buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28); // Byte rate
        buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32); // Block align
        buffer.writeUInt16LE(bitsPerSample, 34);

        // data sub-chunk
        buffer.write('data', 36);
        buffer.writeUInt32LE(dataLength, 40);

        return Buffer.concat([buffer, data]);
    }
}

// ----------------- 单例实例化及数据加载 -----------------

/**
 * AudioSynth 的全局单例
 */
const Synth = new AudioSynth();

// 加载默认的调制函数
Synth.loadModulationFunction(
    (i, s, f, x) => Math.sin(2 * Math.PI * (i / s * f) + x),      // 1
    (i, s, f, x) => Math.sin(4 * Math.PI * (i / s * f) + x),      // 2
    (i, s, f, x) => Math.sin(8 * Math.PI * (i / s * f) + x),      // 3
    (i, s, f, x) => Math.sin(0.5 * Math.PI * (i / s * f) + x),    // 4
    (i, s, f, x) => Math.sin(0.25 * Math.PI * (i / s * f) + x),   // 5
    (i, s, f, x) => 0.5 * Math.sin(2 * Math.PI * (i / s * f) + x),// 6
    (i, s, f, x) => 0.5 * Math.sin(4 * Math.PI * (i / s * f) + x),// 7
    (i, s, f, x) => 0.5 * Math.sin(8 * Math.PI * (i / s * f) + x),// 8
    (i, s, f, x) => 0.5 * Math.sin(0.5 * Math.PI * (i / s * f) + x),// 9
    (i, s, f, x) => 0.5 * Math.sin(0.25 * Math.PI * (i / s * f) + x)// 10
);

// 加载默认的乐器
Synth.loadSoundProfile(
    {
        name: 'piano',
        attack: () => 0.002,
        dampen: (sampleRate, frequency, volume) => Math.pow(0.5 * Math.log((frequency! * volume!) / sampleRate!), 2),
        wave: function(i, sampleRate, frequency, volume) {
            const base = this.modulate[0];
            return this.modulate[1](
                i, sampleRate, frequency,
                Math.pow(base(i, sampleRate, frequency, 0), 2) +
                (0.75 * base(i, sampleRate, frequency, 0.25)) +
                (0.1 * base(i, sampleRate, frequency, 0.5))
            );
        }
    },
    {
        name: 'organ',
        attack: () => 0.3,
        dampen: (sampleRate, frequency) => 1 + (frequency! * 0.01),
        wave: function(i, sampleRate, frequency) {
            const base = this.modulate[0];
            return this.modulate[1](
                i, sampleRate, frequency,
                base(i, sampleRate, frequency, 0) +
                0.5 * base(i, sampleRate, frequency, 0.25) +
                0.25 * base(i, sampleRate, frequency, 0.5)
            );
        }
    },
    {
        name: 'acoustic',
        attack: () => 0.002,
        dampen: () => 1,
        wave: function(i, sampleRate, frequency) {
            const vars = this.vars;
            vars.valueTable = vars.valueTable ?? [];
            vars.playVal = vars.playVal ?? 0;
            vars.periodCount = vars.periodCount ?? 0;

            const period = sampleRate / frequency;
            const p_hundredth = Math.floor((period - Math.floor(period)) * 100);

            if (vars.valueTable.length <= Math.ceil(period)) {
                vars.valueTable.push(Math.round(Math.random()) * 2 - 1);
                return vars.valueTable[vars.valueTable.length - 1];
            } else {
                vars.valueTable[vars.playVal] = (vars.valueTable[vars.playVal >= (vars.valueTable.length - 1) ? 0 : vars.playVal + 1] + vars.valueTable[vars.playVal]) * 0.5;
                let resetPlay = false;
                if (vars.playVal >= Math.floor(period)) {
                    if (vars.playVal < Math.ceil(period)) {
                        if ((vars.periodCount % 100) >= p_hundredth) {
                            resetPlay = true;
                            vars.valueTable[vars.playVal + 1] = (vars.valueTable[0] + vars.valueTable[vars.playVal + 1]) * 0.5;
                            vars.periodCount++;
                        }
                    } else {
                        resetPlay = true;
                    }
                }
                const _return = vars.valueTable[vars.playVal];
                if (resetPlay) {
                    vars.playVal = 0;
                } else {
                    vars.playVal++;
                }
                return _return;
            }
        }
    },
    {
        name: 'edm',
        attack: () => 0.002,
        dampen: () => 1,
        wave: function(i, sampleRate, frequency) {
            const base = this.modulate[0];
            const mod = this.modulate.slice(1);
            return mod[0](
                i, sampleRate, frequency,
                mod[9](
                    i, sampleRate, frequency,
                    mod[2](
                        i, sampleRate, frequency,
                        Math.pow(base(i, sampleRate, frequency, 0), 3) +
                        Math.pow(base(i, sampleRate, frequency, 0.5), 5) +
                        Math.pow(base(i, sampleRate, frequency, 1), 7)
                    )
                ) +
                mod[8](i, sampleRate, frequency, base(i, sampleRate, frequency, 1.75))
            );
        }
    }
);

export default Synth;