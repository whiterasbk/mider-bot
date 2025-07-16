declare module 'src/lamejs' {

    /**
     * Represents a WAV file header containing metadata.
     */
    export class WavHeader {
        /** The number of audio channels. */
        public channels: number;
        /** The sample rate of the audio (e.g., 44100). */
        public sampleRate: number;
        /** The byte offset where the audio data begins. */
        public dataOffset: number;
        /** The length of the audio data in bytes. */
        public dataLen: number;

        /** FourCC code for "RIFF". */
        public static readonly RIFF: number;
        /** FourCC code for "WAVE". */
        public static readonly WAVE: number;
        /** FourCC code for "fmt ". */
        public static readonly fmt_: number;
        /** FourCC code for "data". */
        public static readonly data: number;

        /**
         * Parses a DataView to extract WAV header information.
         * @param dataView A DataView of the WAV file.
         * @returns A WavHeader instance if parsing is successful, otherwise undefined.
         */
        public static readHeader(dataView: DataView): WavHeader | undefined;
    }

    /**
     * The main MP3 encoder class.
     */
    export class Mp3Encoder {
        /**
         * Creates and initializes an MP3 encoder.
         * @param channels The number of channels (1 for mono, 2 for stereo). Defaults to 1.
         * @param sampleRate The sample rate in Hz (e.g., 44100). Defaults to 44100.
         * @param kbps The bitrate in kbps (e.g., 128). Defaults to 128.
         */
        constructor(channels?: number, sampleRate?: number, kbps?: number);

        /**
         * Encodes a buffer of PCM audio samples.
         * The samples should be 16-bit signed integers.
         * @param left A Int16Array containing the left channel audio samples. For mono, this is the only channel needed.
         * @param right An optional Int16Array for the right channel audio samples. If not provided for stereo, it will encode silence.
         * @returns An Int8Array containing the encoded MP3 data chunk.
         */
        encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;

        /**
         * Flushes any remaining data in the encoder.
         * This should be called after all audio samples have been encoded.
         * @returns An Int8Array containing the final MP3 data chunk.
         */
        flush(): Int8Array;
    }

}