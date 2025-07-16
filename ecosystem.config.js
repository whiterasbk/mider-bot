module.exports = {
    apps: [
        {
            name: 'mider-bot',
            script: 'src/telegram/bot.ts',
            interpreter: 'ts-node',
            watch: false,  // 或 true，开发可开
        }
    ]
}
