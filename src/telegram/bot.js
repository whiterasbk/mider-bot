
const { miderGenMidiBuffer } = require('../../lib/mider.js')
const TelegramBot = require('node-telegram-bot-api');

const { token } = require('./token.json')

const bot = new TelegramBot(token, { polling: true, testEnvironment: true });

const todos = {};

bot.onText(/\/add (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const text = match[1];

    if (!todos[chatId]) {
        todos[chatId] = [];
    }
    todos[chatId].push(text);

    bot.sendMessage(chatId, 'Added "' + text + '" to your to-do list.');
});

bot.onText(/\/list/, (msg) => {
    const chatId = msg.chat.id;
    const todoList = todos[chatId];

    let message = 'Your to-do items are:\n';
    todoList.forEach((item, index) => {
        message += `${index + 1}. ${item}\n`;
    });
    bot.sendMessage(chatId, message);
});