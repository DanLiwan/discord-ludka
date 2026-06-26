// database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'tokens.db');
const db = new sqlite3.Database(dbPath);

// Создаём таблицу пользователей
db.run(`
    CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        username TEXT,
        tokens INTEGER DEFAULT 0,
        messages_count INTEGER DEFAULT 0,
        last_message_time INTEGER
    )
`);

// Функция: получить токены пользователя
function getTokens(userId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT tokens FROM users WHERE user_id = ?',
            [userId],
            (err, row) => {
                if (err) reject(err);
                resolve(row ? row.tokens : 0);
            }
        );
    });
}

// Функция: добавить токены
function addTokens(userId, username, amount) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO users (user_id, username, tokens, messages_count) 
             VALUES (?, ?, ?, 1) 
             ON CONFLICT(user_id) DO UPDATE SET 
                tokens = tokens + ?,
                messages_count = messages_count + 1,
                username = ?`,
            [userId, username, amount, amount, username],
            (err) => {
                if (err) reject(err);
                resolve();
            }
        );
    });
}

// Функция: списать токены
function spendTokens(userId, amount) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE users SET tokens = tokens - ? 
             WHERE user_id = ? AND tokens >= ?`,
            [amount, userId, amount],
            function(err) {
                if (err) reject(err);
                resolve(this.changes > 0);
            }
        );
    });
}

// Функция: получить информацию о пользователе
function getUserInfo(userId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM users WHERE user_id = ?',
            [userId],
            (err, row) => {
                if (err) reject(err);
                resolve(row);
            }
        );
    });
}

module.exports = {
    getTokens,
    addTokens,
    spendTokens,
    getUserInfo
};