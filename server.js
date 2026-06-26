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
const MESSAGES_FOR_TOKEN = 10;
const TOKENS_PER_SPIN = 1;

// ⚠️ ЗАМЕНИТЕ НА РЕАЛЬНЫЕ ID РОЛЕЙ!
const ROLE_MAPPING = {
    '🏔️ Роль 1': '1519714246848413919',
    '🌊 Роль 2': '1519714472569213119',
    '🌆 Роль 3': '1519714563149402112',
};

const GUILD_ID = '1471915265280315433';

// ===== КЕШ УЧАСТНИКОВ =====
let membersCache = new Map();
let cacheLastUpdate = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 час

// Функция: добавить участника в кеш
function addMemberToCache(member) {
    membersCache.set(member.user.id, {
        id: member.user.id,
        username: member.user.username.toLowerCase(),
        nickname: member.nickname ? member.nickname.toLowerCase() : null,
        globalName: member.user.globalName ? member.user.globalName.toLowerCase() : null,
        displayName: member.displayName.toLowerCase(),
        user: member.user,
        member: member
    });
}

// Функция: удалить участника из кеша
function removeMemberFromCache(userId) {
    membersCache.delete(userId);
}

// Функция: обновить кеш участника (при смене ника)
function updateMemberInCache(member) {
    if (membersCache.has(member.user.id)) {
        addMemberToCache(member); // Перезаписываем
        console.log(`🔄 Обновлён кеш для ${member.user.username}`);
    }
}

// Полное обновление кеша
async function refreshMemberCache() {
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const members = await guild.members.fetch();
        
        membersCache.clear();
        members.forEach(member => {
            addMemberToCache(member);
        });
        
        cacheLastUpdate = Date.now();
        console.log(`✅ Кеш обновлён: ${membersCache.size} участников`);
        return true;
    } catch (error) {
        console.error('❌ Ошибка обновления кеша:', error);
        return false;
    }
}

// Поиск пользователя в кеше
function findUserInCache(searchQuery) {
    const query = searchQuery.trim().toLowerCase();
    
    if (/^\d+$/.test(query)) {
        return membersCache.get(query) || null;
    }
    
    for (const [id, data] of membersCache) {
        if (data.username === query || 
            data.nickname === query || 
            data.globalName === query ||
            data.displayName === query) {
            return data;
        }
    }
    
    return null;
}

// ===== СОБЫТИЯ DISCORD (автообновление кеша) =====

// 1. Новый участник зашёл на сервер
client.on('guildMemberAdd', (member) => {
    if (member.guild.id === GUILD_ID) {
        addMemberToCache(member);
        console.log(`➕ Новый участник добавлен в кеш: ${member.user.username}`);
    }
});

// 2. Участник вышел с сервера
client.on('guildMemberRemove', (member) => {
    if (member.guild.id === GUILD_ID) {
        removeMemberFromCache(member.user.id);
        console.log(`➖ Участник удалён из кеша: ${member.user.username}`);
    }
});

// 3. Участник сменил ник
client.on('guildMemberUpdate', (oldMember, newMember) => {
    if (newMember.guild.id === GUILD_ID) {
        updateMemberInCache(newMember);
        console.log(`🔄 Обновлён кеш для ${newMember.user.username}`);
    }
});

// 4. При запуске бота — загружаем всех участников
client.once('ready', async () => {
    console.log(`✅ Бот запущен как ${client.user.tag}`);
    await refreshMemberCache();
    console.log(`🌐 Сервер на порту ${process.env.PORT || 3000}`);
});

// Периодическое полное обновление (раз в час — для синхронизации)
setInterval(async () => {
    await refreshMemberCache();
}, CACHE_TTL);

// ===== СЧЁТЧИК СООБЩЕНИЙ =====
const messageCounts = new Map();

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const userId = message.author.id;
    const username = message.author.username;

    // Убеждаемся, что пользователь есть в кеше (если нет — добавляем)
    if (!membersCache.has(userId)) {
        addMemberToCache(message.member);
        console.log(`➕ Добавлен в кеш через сообщение: ${username}`);
    }

    const key = `${message.guild.id}-${userId}`;
    const currentCount = (messageCounts.get(key) || 0) + 1;
    messageCounts.set(key, currentCount);

    if (currentCount % MESSAGES_FOR_TOKEN === 0) {
        try {
            await db.addTokens(userId, username, 1);
            console.log(`✅ +1 токен для ${username} (${currentCount} сообщений)`);
        } catch (error) {
            console.error('❌ Ошибка при выдаче токена:', error);
        }
    }
});

// ===== API =====

// Получить баланс токенов
app.post('/api/get-tokens', async (req, res) => {
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ success: false, error: '❌ Не указан пользователь' });
    }

    try {
        const userData = findUserInCache(userId);
        
        if (!userData) {
            return res.json({
                success: true,
                tokens: 0,
                messages: 0,
                username: userId,
                found: false
            });
        }
        
        const userInfo = await db.getUserInfo(userData.id);
        
        res.json({
            success: true,
            tokens: userInfo?.tokens || 0,
            messages: userInfo?.messages_count || 0,
            username: userData.user.username,
            userId: userData.id,
            found: true
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
        const userData = findUserInCache(userId);
        
        if (!userData) {
            return res.status(404).json({ 
                success: false, 
                error: '❌ Пользователь не найден на сервере' 
            });
        }
        
        const userIdReal = userData.id;
        const tokens = await db.getTokens(userIdReal);
        
        if (tokens < TOKENS_PER_SPIN) {
            return res.json({
                success: false,
                error: `❌ Недостаточно токенов! У вас ${tokens}, нужно ${TOKENS_PER_SPIN}`,
                tokens: tokens
            });
        }
        
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

// Выдать роль
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
            error: `❌ Роль "${roleName}" не найдена в настройках` 
        });
    }

    try {
        const userData = findUserInCache(userId);
        
        if (!userData) {
            return res.status(404).json({ 
                success: false, 
                error: '❌ Пользователь не найден на сервере' 
            });
        }

        const guild = await client.guilds.fetch(GUILD_ID);
        const member = await guild.members.fetch(userData.id);
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

// Статус кеша (для отладки)
app.get('/api/cache-status', (req, res) => {
    res.json({
        size: membersCache.size,
        lastUpdate: new Date(cacheLastUpdate).toISOString(),
        age: Math.round((Date.now() - cacheLastUpdate) / 1000 / 60) + ' минут'
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});

client.login(TOKEN);