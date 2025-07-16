
import { token } from './token.json'
import TelegramBot from "node-telegram-bot-api"
import {midercodeToMp3Buffer} from "../utils";
import {createHash} from "node:crypto";

const bot = new TelegramBot(token, { polling: true, testEnvironment: false })

const md5 = str => createHash('md5').update(str).digest('hex');

const cmdRegex = new RegExp(`>(g|f|\\d+b)((;[-+b#]?[A-G](min|maj|major|minor)?)|(;\\d)|(;img)|(;pdf)|(;mscz)|(;sing(:[a-zA-Z-]{2,4})?(:[fm]?\\d+)?)|(;midi)|(;\\d{1,3}%)|(;/\\d+)|(;\\d+dB)|(;[↑↓]+)|(;\\d+(\\.\\d+)?x)|(;i=([a-zA-Z-]+|\\d+))|(;\\d/\\d))*>[\\S\\s]+`)

console.log('matching reg: ' + cmdRegex)

bot.onText(cmdRegex, async(msg, match) => {
    if (match) {
        let text = match[0]
        console.log('received text: ' + text)
        await bot.sendVoice(msg.chat.id, midercodeToMp3Buffer(text), {}, {
            filename: md5(text).slice(0, 7) + '.mp3',
            contentType: 'audio/mpeg'
        })
    }
})