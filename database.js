// database.js
const { Pool } = require('pg');

// ⚠️ ВРЕМЕННО: Жёстко прописываем URL (пока не починим переменные)
const DATABASE_URL = 'postgresql://postgres:eqdGCFFDjZtgtjMZwjhkeHHEdmQYIMwrsr@postgres.railway.internal:5432/railway';

console.log('🔍 Используем DATABASE_URL:', DATABASE_URL.substring(0, 40) + '...');

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

// Создаём таблицу при запуске
async function initDatabase() {
    let client;
    try {
        client = await pool.connect();
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                username TEXT,
                tokens INTEGER DEFAULT 0,
                messages_count INTEGER DEFAULT 0,
                spins INTEGER DEFAULT 0,
                last_message_time BIGINT
            )
        `);
        console.log('✅ Таблица users создана/обновлена');
        return true;
    } catch (error) {
        console.error('❌ Ошибка создания таблицы:', error.message);
        console.error('❌ Полная ошибка:', error);
        return false;
    } finally {
        if (client) client.release();
    }
}

// Инициализируем БД при запуске
initDatabase();

// Получить токены
async function getTokens(userId) {
    const result = await pool.query(
        'SELECT tokens, spins FROM users WHERE user_id = $1',
        [userId]
    );
    return result.rows[0]?.tokens || 0;
}

// Добавить токены (автоматически, за сообщения)
async function addTokens(userId, username, amount) {
    await pool.query(
        `INSERT INTO users (user_id, username, tokens, messages_count, spins) 
         VALUES ($1, $2, $3, 1, 0) 
         ON CONFLICT (user_id) DO UPDATE SET 
            tokens = users.tokens + $3,
            messages_count = users.messages_count + 1,
            username = $2`,
        [userId, username, amount]
    );
}

// Снять токены за спин
async function spendTokens(userId, amount) {
    const result = await pool.query(
        `UPDATE users SET tokens = tokens - $1, spins = spins + 1 
         WHERE user_id = $2 AND tokens >= $1`,
        [amount, userId]
    );
    return result.rowCount > 0;
}

// Получить информацию о пользователе
async function getUserInfo(userId) {
    const result = await pool.query(
        'SELECT * FROM users WHERE user_id = $1',
        [userId]
    );
    return result.rows[0] || null;
}

// Добавить токены вручную (для команды !addtoken)
async function addTokensManual(userId, username, amount) {
    await pool.query(
        `INSERT INTO users (user_id, username, tokens, messages_count, spins) 
         VALUES ($1, $2, $3, 0, 0) 
         ON CONFLICT (user_id) DO UPDATE SET 
            tokens = users.tokens + $3,
            username = $2`,
        [userId, username, amount]
    );
}

module.exports = {
    getTokens,
    addTokens,
    spendTokens,
    getUserInfo,
    addTokensManual,
    initDatabase
};