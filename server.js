const express = require('express');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Обработка корневого маршрута
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

// ⚠️ ЗАМЕНИТЕ НА РЕАЛЬНЫЕ ID РОЛЕЙ С ВАШЕГО СЕРВЕРА!
const ROLE_MAPPING = {
    '🏔️ Роль 1': '1519714246848413919',
    '🌊 Роль 2': '1519714472569213119',
    '🌆 Роль 3': '1519714563149402112',
};

// ⚠️ ID ВАШЕГО СЕРВЕРА
const GUILD_ID = '1471915265280315433';

client.once('ready', () => {
    console.log(`✅ Бот запущен как ${client.user.tag}`);
    console.log(`🌐 Сервер на порту ${process.env.PORT || 3000}`);
});

// 🔥 НОВАЯ ФУНКЦИЯ: поиск пользователя по имени
async function findUserByName(guild, username) {
    // Убираем пробелы и приводим к нижнему регистру для поиска
    const searchName = username.trim().toLowerCase();
    
    // Получаем всех участников сервера
    const members = await guild.members.fetch();
    
    // Ищем пользователя по имени (без учёта регистра)
    const found = members.find(member => {
        const memberName = member.user.username.toLowerCase();
        const memberNick = member.nickname ? member.nickname.toLowerCase() : '';
        const memberGlobalName = member.user.globalName ? member.user.globalName.toLowerCase() : '';
        
        return memberName === searchName || 
                memberNick === searchName || 
                memberGlobalName === searchName;
    });
    
    return found;
}

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
            error: `❌ Роль "${roleName}" не найдена в настройках бота` 
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

        // 🔥 ПРОВЕРЯЕМ: если userId - это число (Snowflake), ищем по ID
        if (/^\d+$/.test(userId)) {
            // Это числовой ID
            try {
                member = await guild.members.fetch(userId);
            } catch {
                return res.status(404).json({ 
                    success: false, 
                    error: '❌ Пользователь с таким ID не найден на сервере' 
                });
            }
        } else {
            // 🔥 ИНАЧЕ: ищем по имени пользователя
            member = await findUserByName(guild, userId);
            
            if (!member) {
                return res.status(404).json({ 
                    success: false, 
                    error: `❌ Пользователь "${userId}" не найден на сервере. Проверьте имя.` 
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