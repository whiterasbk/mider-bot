
export function genMidiBuffer(code: string): Uint8Array
export function genMusicXml(code: string): string

export class MiderCodeParserConfiguration {
    formatMode: string = "internal->java-lame"
    isBlankReplaceWith0: Boolean = false
}
