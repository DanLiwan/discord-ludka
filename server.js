const express = require('express');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();
const cors = require('cors');
const db = require('./database');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessages,
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;

// НАСТРОЙКИ
const MESSAGES_FOR_TOKEN = 10; // За каждые 10 сообщений
const TOKENS_PER_SPIN = 1;     // 1 токен за спин

// РОЛИ
const ROLE_MAPPING = {
    '🏔️ Роль 1': '1519714246848413919',
    '🌊 Роль 2': '1519714472569213119',
    '🌆 Роль 3': '1519714563149402112',
};

const GUILD_ID = '1471915265280315433';

// --- СЧЁТЧИК СООБЩЕНИЙ ---
const messageCounts = new Map();

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const userId = message.author.id;
    const username = message.author.username;

    // Считаем сообщения
    const key = `${message.guild.id}-${userId}`;
    const currentCount = (messageCounts.get(key) || 0) + 1;
    messageCounts.set(key, currentCount);

    // За каждые MESSAGES_FOR_TOKEN сообщений даём токен
});

client.once('ready', () => {
    console.log(`✅ Бот запущен как ${client.user.tag}`);
    console.log(`🌐 Сервер на порту ${process.env.PORT || 3000}`);
});

// --- API ЭНДПОИНТЫ ---

// Получить баланс токенов
app.post('/api/get-tokens', async (req, res) => {
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ success: false, error: '❌ Не указан пользователь' });
    }

    try {
        let userInfo;
        
        // Если это ID (число) — ищем по ID
        if (/^\d+$/.test(userId)) {
            userInfo = await db.getUserInfo(userId);
        } else {
            // Ищем по имени на сервере
            const guild = await client.guilds.fetch(GUILD_ID);
            const members = await guild.members.fetch();
            const found = members.find(m => 
                m.user.username.toLowerCase() === userId.toLowerCase() ||
                (m.nickname && m.nickname.toLowerCase() === userId.toLowerCase())
            );
            
            if (found) {
                userInfo = await db.getUserInfo(found.user.id);
                if (userInfo) {
                    userInfo.username = found.user.username;
                }
            }
        }
        
        if (!userInfo) {
            return res.json({
                success: true,
                tokens: 0,
                messages: 0,
                username: userId
            });
        }
        
        res.json({
            success: true,
            tokens: userInfo.tokens || 0,
            messages: userInfo.messages_count || 0,
            username: userInfo.username || userId
        });
        
    } catch (error) {
        console.error('❌ Ошибка:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Снять токены за спин
app.post('/api/spend-token', async (req, res) => {
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ success: false, error: '❌ Не указан пользователь' });
    }

    try {
        let userIdReal = userId;
        let username = userId;
        
        // Если это имя — ищем реальный ID
        if (!/^\d+$/.test(userId)) {
            const guild = await client.guilds.fetch(GUILD_ID);
            const members = await guild.members.fetch();
            const found = members.find(m => 
                m.user.username.toLowerCase() === userId.toLowerCase() ||
                (m.nickname && m.nickname.toLowerCase() === userId.toLowerCase())
            );
            
            if (found) {
                userIdReal = found.user.id;
                username = found.user.username;
            } else {
                return res.status(404).json({ 
                    success: false, 
                    error: '❌ Пользователь не найден' 
                });
            }
        }
        
        // Проверяем баланс
        const tokens = await db.getTokens(userIdReal);
        if (tokens < TOKENS_PER_SPIN) {
            return res.json({
                success: false,
                error: `❌ Недостаточно токенов! У вас ${tokens}, нужно ${TOKENS_PER_SPIN}`,
                tokens: tokens
            });
        }
        
        // Списываем токен
        const spent = await db.spendTokens(userIdReal, TOKENS_PER_SPIN);
        if (!spent) {
            return res.json({
                success: false,
                error: '❌ Ошибка при списании токенов'
            });
        }
        
        const newBalance = await db.getTokens(userIdReal);
        res.json({
            success: true,
            tokens: newBalance,
            message: `✅ Списан 1 токен. Осталось: ${newBalance}`
        });
        
    } catch (error) {
        console.error('❌ Ошибка:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- ВЫДАЧА РОЛИ (обновлённая) ---
async function findUserByName(guild, username) {
    const searchName = username.trim().toLowerCase();
    const members = await guild.members.fetch();
    
    return members.find(member => {
        const memberName = member.user.username.toLowerCase();
        const memberNick = member.nickname ? member.nickname.toLowerCase() : '';
        return memberName === searchName || memberNick === searchName;
    });
}

app.post('/api/give-role', async (req, res) => {
    const { userId, roleName } = req.body;

    if (!userId || !roleName) {
        return res.status(400).json({ 
            success: false, 
            error: '❌ Не хватает данных' 
        });
    }

    const roleId = ROLE_MAPPING[roleName];
    if (!roleId) {
        return res.status(400).json({ 
            success: false, 
            error: `❌ Роль "${roleName}" не найдена` 
        });
    }

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        if (!guild) {
            return res.status(404).json({ 
                success: false, 
                error: '❌ Сервер не найден' 
            });
        }

        let member;

        if (/^\d+$/.test(userId)) {
            try {
                member = await guild.members.fetch(userId);
            } catch {
                return res.status(404).json({ 
                    success: false, 
                    error: '❌ Пользователь не найден на сервере' 
                });
            }
        } else {
            member = await findUserByName(guild, userId);
            if (!member) {
                return res.status(404).json({ 
                    success: false, 
                    error: `❌ Пользователь "${userId}" не найден` 
                });
            }
        }

        const role = await guild.roles.fetch(roleId);
        if (!role) {
            return res.status(404).json({ 
                success: false, 
                error: '❌ Роль не найдена на сервере' 
            });
        }

        if (member.roles.cache.has(roleId)) {
            return res.json({ 
                success: true, 
                message: `✅ У пользователя уже есть роль "${roleName}"`,
                alreadyHas: true
            });
        }

        await member.roles.add(role);
        console.log(`✅ Выдана роль "${roleName}" пользователю ${member.user.tag}`);
        
        res.json({
            success: true,
            message: `✅ Роль "${roleName}" успешно выдана!`,
            roleName: roleName,
            userId: member.user.id,
            username: member.user.username
        });

    } catch (error) {
        console.error('❌ Ошибка:', error);
        res.status(500).json({
            success: false,
            error: `❌ ${error.message}`
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});

client.login(TOKEN);