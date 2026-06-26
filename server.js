const express = require('express');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Раздаём статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// 👇 НОВЫЙ БЛОК - ОБРАБОТКА МАРШРУТОВ
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Discord бот
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessages,
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;

// ⚠️ ЗАМЕНИТЕ НА СВОИ ID!
const ROLE_MAPPING = {
    '🏔️ Горы': '1519714246848413919',
    '🌊 Море': '1519714472569213119',
    '🌆 Город': '1519714563149402112',
};

const GUILD_ID = '1471915265280315433'; // ID вашего сервера

client.once('ready', () => {
    console.log(`✅ Бот запущен как ${client.user.tag}`);
    console.log(`🌐 Сервер на порту ${process.env.PORT || 3000}`);
});

// API для выдачи роли
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
        const member = await guild.members.fetch(userId);
        const role = await guild.roles.fetch(roleId);

        if (member.roles.cache.has(roleId)) {
            return res.json({ 
                success: true, 
                message: `✅ У пользователя уже есть роль`,
                alreadyHas: true
            });
        }

        await member.roles.add(role);
        console.log(`✅ Выдана роль "${roleName}" пользователю ${member.user.tag}`);
        
        res.json({
            success: true,
            message: `✅ Роль "${roleName}" выдана!`,
            roleName: roleName
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