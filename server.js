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
        GatewayIntentBits.GuildVoiceStates,
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;

// НАСТРОЙКИ
const MESSAGES_FOR_TOKEN = 50;
const TOKENS_PER_SPIN = 1;
const VOICE_TOKEN_INTERVAL = 30 * 60 * 1000;

// ⚠️ ЗАМЕНИТЕ НА РЕАЛЬНЫЕ ID РОЛЕЙ!
const ROLE_MAPPING = {
    'Ташла ПТУ': '1520108336723394561',
    'Нытик сука': '1520108831030640660',
    'Калопоглатитель': '1520109055052484802',
    'Баакен': '1520109206559129741',
    'Скорострельный': '1520109522645942332',
    'Рыбная братва': '1520109676732092518',
    'Чурка': '1520109763944251613',
    'Профитроль': '1520109847863889981',
    'ЖЕНСКИЕ НОГИ': '1520109969788371165',
    'АрЫстан Назераке': '1520110213133369565',
    'Сифилисная сука': '1520110307391967303',
    'Ваннорасказчик': '1520110647612801338',
    'Артём поедатель пельменей': '1520110665144995891',
    'Король Додепа': '1520110768782049421',
    'Селезень': '1520111177231761470',
    'Пидрохлорид': '1520111363966500874',
};

const GUILD_ID = '1467562983289913470';

// ===== КЕШ УЧАСТНИКОВ =====
let membersCache = new Map();
let cacheLastUpdate = 0;
const CACHE_TTL = 60 * 60 * 1000;

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

function removeMemberFromCache(userId) {
    membersCache.delete(userId);
}

function updateMemberInCache(member) {
    if (membersCache.has(member.user.id)) {
        addMemberToCache(member);
        console.log(`🔄 Обновлён кеш для ${member.user.username}`);
    }
}

async function refreshMemberCache() {
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const members = await guild.members.fetch();
        membersCache.clear();
        members.forEach(member => addMemberToCache(member));
        cacheLastUpdate = Date.now();
        console.log(`✅ Кеш обновлён: ${membersCache.size} участников`);
        return true;
    } catch (error) {
        console.error('❌ Ошибка обновления кеша:', error);
        return false;
    }
}

function findUserInCache(searchQuery) {
    const query = searchQuery.trim().toLowerCase();
    if (/^\d+$/.test(query)) {
        return membersCache.get(query) || null;
    }
    for (const [id, data] of membersCache) {
        if (data.username === query || data.nickname === query || data.globalName === query || data.displayName === query) {
            return data;
        }
    }
    return null;
}

// ===== ГОЛОСОВЫЕ ТОКЕНЫ =====
const voiceJoinTimes = new Map();
const voiceIntervals = new Map();

async function checkVoiceTime(userId, username) {
    const joinTime = voiceJoinTimes.get(userId);
    if (!joinTime) return;
    
    const elapsed = Date.now() - joinTime;
    if (elapsed >= VOICE_TOKEN_INTERVAL) {
        try {
            await db.addTokens(userId, username, 1);
            console.log(`🎤 +1 токен за 30 минут в войсе для ${username}`);
            voiceJoinTimes.set(userId, Date.now());
        } catch (error) {
            console.error('❌ Ошибка при выдаче токена за войс:', error);
        }
    }
}

client.on('voiceStateUpdate', async (oldState, newState) => {
    if (newState.member.user.bot) return;
    const userId = newState.member.id;
    const username = newState.member.user.username;
    const guildId = newState.guild.id;
    if (guildId !== GUILD_ID) return;
    
    if (!oldState.channelId && newState.channelId) {
        voiceJoinTimes.set(userId, Date.now());
        console.log(`🔊 ${username} зашёл в голосовой канал`);
        const interval = setInterval(() => {
            const member = newState.guild.members.cache.get(userId);
            if (!member || !member.voice.channelId) {
                clearInterval(interval);
                voiceIntervals.delete(userId);
                voiceJoinTimes.delete(userId);
                console.log(`🔇 ${username} вышел из голосового канала`);
                return;
            }
            checkVoiceTime(userId, username);
        }, 5000);
        voiceIntervals.set(userId, interval);
    }
    if (oldState.channelId && !newState.channelId) {
        const interval = voiceIntervals.get(userId);
        if (interval) {
            clearInterval(interval);
            voiceIntervals.delete(userId);
        }
        voiceJoinTimes.delete(userId);
        console.log(`🔇 ${username} вышел из голосового канала`);
    }
});

process.on('SIGINT', () => {
    for (const [userId, interval] of voiceIntervals) {
        clearInterval(interval);
    }
    console.log('🧹 Интервалы очищены');
    process.exit(0);
});

// ===== СОБЫТИЯ DISCORD =====
client.on('guildMemberAdd', (member) => {
    if (member.guild.id === GUILD_ID) {
        addMemberToCache(member);
        console.log(`➕ Новый участник добавлен в кеш: ${member.user.username}`);
    }
});

client.on('guildMemberRemove', (member) => {
    if (member.guild.id === GUILD_ID) {
        removeMemberFromCache(member.user.id);
        console.log(`➖ Участник удалён из кеша: ${member.user.username}`);
    }
});

client.on('guildMemberUpdate', (oldMember, newMember) => {
    if (newMember.guild.id === GUILD_ID) {
        updateMemberInCache(newMember);
    }
});

client.once('ready', async () => {
    console.log(`✅ Бот запущен как ${client.user.tag}`);
    await refreshMemberCache();
    console.log(`🌐 Сервер на порту ${process.env.PORT || 3000}`);
});

setInterval(async () => {
    await refreshMemberCache();
}, CACHE_TTL);

// ===== ОБРАБОТКА СООБЩЕНИЙ (СЧЁТЧИК + КОМАНДЫ) =====
const messageCounts = new Map();

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;
    
    const userId = message.author.id;
    const username = message.author.username;
    
    // ===== НОВАЯ КОМАНДА: !лудка =====
    if (message.content.toLowerCase() === '!лудка') {
        try {
            const embed = {
                title: '🎰 LUDKAA ROULETTE 🎰',
                description: 'Крутите рулетку и выигрывайте роли!',
                fields: [
                    {
                        name: '🔗 Ссылка',
                        value: 'https://discord-ludka-production.up.railway.app',
                        inline: false
                    },
                    {
                        name: '📖 Как играть?',
                        value: '1️⃣ Зарабатывайте токены за сообщения (50 сообщений = 1 токен)\n2️⃣ Введите свой ID на сайте\n3️⃣ Крутите рулетку за 1 токен',
                        inline: false
                    },
                    {
                        name: '🎯 Доступные роли',
                        value: 'Ташла ПТУ, Нытик сука, Калопоглатитель, Баакен, Скорострельный, Рыбная братва, Чурка, Профитроль, ЖЕНСКИЕ НОГИ, АрЫстан Назераке, Сифилисная сука, Ваннорасказчик, Артём поедатель пельменей, Король Додепа, Селезень, Пидрохлорид',
                        inline: false
                    }
                ],
                color: 0xF7971E,
                thumbnail: {
                    url: message.guild.iconURL({ dynamic: true })
                },
                footer: {
                    text: '🎰 Ролльная LUDKAA',
                    icon_url: message.author.displayAvatarURL({ dynamic: true })
                },
                timestamp: new Date().toISOString()
            };
            
            await message.reply({ embeds: [embed] });
            console.log(`🔗 ${username} запросил ссылку на сайт`);
        } catch (error) {
            console.error('❌ Ошибка при выполнении команды !лудка:', error);
            await message.reply('❌ Произошла ошибка. Попробуйте позже.');
        }
        return;
    }

    // ===== 1. КОМАНДА: !токены =====
    if (message.content.toLowerCase().startsWith('!токены')) {
        try {
            const tokens = await db.getTokens(userId);
            const userInfo = await db.getUserInfo(userId);
            const messagesCount = userInfo?.messages_count || 0;
            const spins = userInfo?.spins || 0;
            
            await message.reply({
                embeds: [{
                    title: '💰 Ваш баланс токенов',
                    description: `
**${username}**, вот ваш баланс:

🎯 **Токены:** \`${tokens}\`
💬 **Сообщений:** \`${messagesCount}\`
🎰 **Спинов:** \`${spins}\`

> 📝 За 50 сообщений = 1 токен
> 🎤 За 30 минут в войсе = 1 токен
                    `,
                    color: 0xF7971E,
                    thumbnail: {
                        url: message.author.displayAvatarURL({ dynamic: true })
                    },
                    timestamp: new Date().toISOString(),
                    footer: {
                        text: '🎰 Ролльная LUDKAA',
                        icon_url: message.guild.iconURL()
                    }
                }]
            });
            
            console.log(`📊 ${username} запросил баланс: ${tokens} токенов, ${spins} спинов`);
        } catch (error) {
            console.error('❌ Ошибка при выполнении команды !токены:', error);
            await message.reply('❌ Произошла ошибка при получении баланса. Попробуйте позже.');
        }
        return;
    }
    
    // ===== 2. СЧЁТЧИК СООБЩЕНИЙ =====
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
app.post('/api/get-tokens', async (req, res) => {
    const { userId } = req.body;
    if (!userId) {
        return res.status(400).json({ success: false, error: '❌ Не указан пользователь' });
    }
    try {
        const userData = findUserInCache(userId);
        if (!userData) {
            return res.json({ success: true, tokens: 0, messages: 0, username: userId, found: false });
        }
        const userInfo = await db.getUserInfo(userData.id);
        res.json({
            success: true,
            tokens: userInfo?.tokens || 0,
            messages: userInfo?.messages_count || 0,
            spins: userInfo?.spins || 0,
            username: userData.user.username,
            userId: userData.id,
            found: true
        });
    } catch (error) {
        console.error('❌ Ошибка:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/spend-token', async (req, res) => {
    const { userId } = req.body;
    if (!userId) {
        return res.status(400).json({ success: false, error: '❌ Не указан пользователь' });
    }
    try {
        const userData = findUserInCache(userId);
        if (!userData) {
            return res.status(404).json({ success: false, error: '❌ Пользователь не найден на сервере' });
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
            return res.json({ success: false, error: '❌ Ошибка при списании токенов' });
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

app.post('/api/give-role', async (req, res) => {
    const { userId, roleName } = req.body;
    if (!userId || !roleName) {
        return res.status(400).json({ success: false, error: '❌ Не хватает данных' });
    }
    const roleId = ROLE_MAPPING[roleName];
    if (!roleId) {
        return res.status(400).json({ success: false, error: `❌ Роль "${roleName}" не найдена в настройках` });
    }
    try {
        const userData = findUserInCache(userId);
        if (!userData) {
            return res.status(404).json({ success: false, error: '❌ Пользователь не найден на сервере' });
        }
        const guild = await client.guilds.fetch(GUILD_ID);
        const member = await guild.members.fetch(userData.id);
        const role = await guild.roles.fetch(roleId);
        if (!role) {
            return res.status(404).json({ success: false, error: '❌ Роль не найдена на сервере' });
        }
        if (member.roles.cache.has(roleId)) {
            return res.json({ success: true, message: `✅ У пользователя уже есть роль "${roleName}"`, alreadyHas: true });
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
        res.status(500).json({ success: false, error: `❌ ${error.message}` });
    }
});

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