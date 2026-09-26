const {
    Client,
    GatewayIntentBits,
    Partials,
    PermissionsBitField,
    ChannelType,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    UserSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    Collection
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ======================================================
// AYARLAR
// ======================================================

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = "k!";
const OWNER_ID = "1003708560728920165"; // Dokunulmaz ve Sınırsız Yetkili ID

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "database.json");

if (!TOKEN) {
    console.error("DISCORD_TOKEN bulunamadı.");
    process.exit(1);
}

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ======================================================
// CLIENT
// ======================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.DirectMessages
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User,
        Partials.GuildMember
    ]
});

// ======================================================
// DATABASE
// ======================================================

const EMPTY_DB = {
    guilds: {},
    punishments: {},
    economy: {},
    temporaryRoles: {},
    temporaryBans: {},
    tkmGames: {},
    giveaways: {},
    drops: {},
    applications: {},
    clans: {},
    tickets: {}
};

let db = EMPTY_DB;

function loadDB() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            db = JSON.parse(JSON.stringify(EMPTY_DB));
            saveDB();
            return;
        }

        const raw = fs.readFileSync(DATA_FILE, "utf8");

        if (!raw.trim()) {
            db = JSON.parse(JSON.stringify(EMPTY_DB));
            saveDB();
            return;
        }

        const parsed = JSON.parse(raw);

        db = {
            ...JSON.parse(JSON.stringify(EMPTY_DB)),
            ...parsed
        };

        db.guilds ||= {};
        db.punishments ||= {};
        db.economy ||= {};
        db.temporaryRoles ||= {};
        db.temporaryBans ||= {};
        db.tkmGames ||= {};
        db.giveaways ||= {};
        db.drops ||= {};
        db.applications ||= {};
        db.clans ||= {};
        db.tickets ||= {};

    } catch (error) {
        console.error("Database yüklenemedi:", error);

        db = JSON.parse(JSON.stringify(EMPTY_DB));
        saveDB();
    }
}

function saveDB() {
    try {
        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(db, null, 2),
            "utf8"
        );
    } catch (error) {
        console.error("Database kaydedilemedi:", error);
    }
}

loadDB();

// ======================================================
// DEFAULT GUILD CONFIG
// ======================================================

function defaultGuildConfig() {
    return {
        prefix: PREFIX,

        moderation: {
            logChannel: null,
            welcomeChannel: null,
            leaveChannel: null,
            suggestionChannel: null,
            announcementChannel: null,
            chatChannel: null,
            linkFilter: false,
            badWordFilter: false,
            autoReply: true,

            marketRoles: [],

            randomRoleId: null
        },

        ticket: {
            categoryId: null,
            panelChannelId: null,
            panelMessageId: null,

            categories: [
                {
                    name: "Genel Destek",
                    emoji: "🎫"
                },
                {
                    name: "Yetkili Destek",
                    emoji: "🛡️"
                },
                {
                    name: "Satın Alma",
                    emoji: "💳"
                },
                {
                    name: "Şikayet",
                    emoji: "⚠️"
                },
                {
                    name: "Diğer",
                    emoji: "📩"
                }
            ],

            staffRoleId: null
        },

        application: {
            enabled: false,
            channelId: null,
            panelMessageId: null,

            questions: [
                "Adın nedir?",
                "Kaç yaşındasın?",
                "Neden başvuruyorsun?",
                "Daha önce yetkili oldun mu?",
                "Neden seni seçmeliyiz?"
            ]
        },

        messageCount: {},

        settings: {
            welcomeEnabled: false,
            leaveEnabled: false
        }
    };
}

function getGuildConfig(guildId) {
    if (!db.guilds[guildId]) {
        db.guilds[guildId] = defaultGuildConfig();
        saveDB();
    }

    const config = db.guilds[guildId];

    config.moderation ||= {};
    config.ticket ||= {};
    config.application ||= {};
    config.settings ||= {};
    config.messageCount ||= {};

    config.moderation.marketRoles ||= [];

    config.ticket.categories ||= [];
    config.application.questions ||= [];

    return config;
}

// ======================================================
// PUNISHMENT DATABASE
// ======================================================

function getPunishments(guildId) {
    if (!db.punishments[guildId]) {
        db.punishments[guildId] = {
            bans: [],
            kicks: [],
            mutes: []
        };
    }

    db.punishments[guildId].bans ||= [];
    db.punishments[guildId].kicks ||= [];
    db.punishments[guildId].mutes ||= [];

    return db.punishments[guildId];
}

// ======================================================
// ECONOMY
// ======================================================

function getEconomy(guildId, userId) {
    db.economy[guildId] ||= {};

    if (!db.economy[guildId][userId]) {
        db.economy[guildId][userId] = {
            balance: 0,
            lastMessageReward: 0,
            lastDaily: 0
        };
    }

    return db.economy[guildId][userId];
}

function getBalance(guildId, userId) {
    return getEconomy(guildId, userId).balance;
}

function addMoney(guildId, userId, amount) {
    const economy = getEconomy(guildId, userId);

    economy.balance += amount;

    saveDB();

    return economy.balance;
}

function removeMoney(guildId, userId, amount) {
    const economy = getEconomy(guildId, userId);

    if (economy.balance < amount) {
        return false;
    }

    economy.balance -= amount;

    saveDB();

    return true;
}

// ======================================================
// SÜRE PARSE
// ======================================================

function parseDuration(input) {
    if (!input) return null;

    const value = String(input)
        .toLowerCase()
        .trim()
        .replace(",", ".");

    const match = value.match(
        /^(\d+(?:\.\d+)?)\s*(s|sn|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks|gün|saat|dakika|dk|hafta)$/
    );

    if (!match) return null;

    const number = Number(match[1]);
    const unit = match[2];

    if (!Number.isFinite(number) || number <= 0) {
        return null;
    }

    const units = {
        s: 1000, sn: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000,
        m: 60 * 1000, min: 60 * 1000, mins: 60 * 1000, minute: 60 * 1000, minutes: 60 * 1000, dakika: 60 * 1000, dk: 60 * 1000,
        h: 60 * 60 * 1000, hr: 60 * 60 * 1000, hrs: 60 * 60 * 1000, hour: 60 * 60 * 1000, hours: 60 * 60 * 1000, saat: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000, day: 24 * 60 * 60 * 1000, days: 24 * 60 * 60 * 1000, gün: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000, week: 7 * 24 * 60 * 60 * 1000, weeks: 7 * 24 * 60 * 60 * 1000, hafta: 7 * 24 * 60 * 60 * 1000
    };

    return Math.floor(number * units[unit]);
}

function formatDuration(ms) {
    let seconds = Math.floor(ms / 1000);

    const days = Math.floor(seconds / 86400);
    seconds %= 86400;

    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;

    const minutes = Math.floor(seconds / 60);
    seconds %= 60;

    const parts = [];

    if (days) parts.push(`${days} gün`);
    if (hours) parts.push(`${hours} saat`);
    if (minutes) parts.push(`${minutes} dakika`);
    if (seconds && parts.length < 2) parts.push(`${seconds} saniye`);

    return parts.join(" ") || "0 saniye";
}

// ======================================================
// MEMBER FETCH
// ======================================================

async function fetchMember(guild, userId) {
    try {
        return await guild.members.fetch(userId);
    } catch {
        return null;
    }
}

// ======================================================
// CHANNEL FETCH
// ======================================================

async function fetchAllChannels(guild) {
    try {
        await guild.channels.fetch();
        return guild.channels.cache;
    } catch (error) {
        console.error(`Kanal listesi alınamadı (${guild.name}):`, error.message);
        return guild.channels.cache;
    }
}

// ======================================================
// ROLE HIERARCHY & AUTHORITY (GÜNCELLENDİ)
// ======================================================

function getHighestRole(member) {
    return member.roles.highest;
}

function isGuildOwner(member) {
    return member.guild.ownerId === member.id;
}

function hasHigherAuthority(actor, target) {
    if (!actor || !target) return false;

    // Özel Yetkili Sınırsız Yetkiye Sahip!
    if (actor.id === OWNER_ID) return true;

    if (actor.id === target.id) return false;

    if (isGuildOwner(actor)) return true;
    if (isGuildOwner(target)) return false;

    return getHighestRole(actor).position > getHighestRole(target).position;
}

function canModerateTarget(actor, target) {
    if (!actor || !target) {
        return { allowed: false, reason: "Üye bulunamadı." };
    }

    if (actor.id === target.id) {
        return { allowed: false, reason: "Kendine bu işlemi uygulayamazsın." };
    }

    // ÖZEL KORUMA: 1003708560728920165 ID'li kullanıcıya kimse dokunamaz!
    if (target.id === OWNER_ID) {
        return { allowed: false, reason: "🛡️ Bu kullanıcı koruma altındadır, sunucudan atılamaz veya yasaklanamaz!" };
    }

    // Özel Yetkili herkesi atabilir
    if (actor.id === OWNER_ID) {
        return { allowed: true };
    }

    if (isGuildOwner(target)) {
        return { allowed: false, reason: "Sunucu sahibine işlem uygulayamazsın." };
    }

    if (!hasHigherAuthority(actor, target)) {
        return { allowed: false, reason: "Bu kişiye işlem uygulayabilmek için ondan daha yüksek bir yetki seviyesinde olmalısın." };
    }

    return { allowed: true };
}

function canManageRole(actor, role) {
    if (!actor || !role) return false;
    if (actor.id === OWNER_ID || isGuildOwner(actor)) return true;

    return actor.roles.highest.position > role.position;
}

function botCanManageRole(guild, role) {
    const me = guild.members.me;
    if (!me || !role) return false;

    return me.roles.highest.position > role.position && !role.managed;
}

// ======================================================
// ADMIN CONTROL
// ======================================================

function isAdmin(member) {
    if (member.id === OWNER_ID) return true;
    return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

function requireAdmin(message) {
    if (!message.member) return false;

    if (!isAdmin(message.member)) {
        message.reply("Bu komutu kullanmak için Yönetici yetkisine sahip olmalısın.")
            .catch(() => {});
        return false;
    }

    return true;
}

// ======================================================
// MENTION PARSER
// ======================================================

function getMentionedUser(message) {
    return message.mentions.users.first() || null;
}

function getMentionedMember(message) {
    return message.mentions.members.first() || null;
}

function getMentionedRole(message) {
    return message.mentions.roles.first() || null;
}

// ======================================================
// EMBED
// ======================================================

function successEmbed(description) {
    return new EmbedBuilder()
        .setColor(0x57F287)
        .setDescription(`✅ ${description}`);
}

function errorEmbed(description) {
    return new EmbedBuilder()
        .setColor(0xED4245)
        .setDescription(`❌ ${description}`);
}

function infoEmbed(description) {
    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setDescription(description);
}

// ======================================================
// LOG
// ======================================================

async function sendLog(guild, title, description, color = 0x5865F2) {
    try {
        const config = getGuildConfig(guild.id);
        if (!config.moderation.logChannel) return;

        const channel = guild.channels.cache.get(config.moderation.logChannel);
        if (!channel || !channel.isTextBased()) return;

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .setDescription(description)
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (error) {
        console.error("Log gönderilemedi:", error.message);
    }
}

// ======================================================
// TEMPORARY DATABASES
// ======================================================

function getTemporaryRoles(guildId) {
    db.temporaryRoles[guildId] ||= [];
    return db.temporaryRoles[guildId];
}

function getTemporaryBans(guildId) {
    db.temporaryBans[guildId] ||= [];
    return db.temporaryBans[guildId];
}

function getTKMGames(guildId) {
    db.tkmGames[guildId] ||= {};
    return db.tkmGames[guildId];
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(array) {
    if (!Array.isArray(array) || array.length === 0) return null;
    return array[Math.floor(Math.random() * array.length)];
}

function cleanReason(text, fallback = "Belirtilmedi.") {
    const result = String(text || "").trim();
    return result || fallback;
}

function canUseChannel(channel, member) {
    if (!channel || !member) return false;
    try {
        const permissions = channel.permissionsFor(member);
        if (!permissions) return false;
        return permissions.has(PermissionsBitField.Flags.ViewChannel);
    } catch {
        return false;
    }
}

function getCommand(message) {
    if (!message.content.startsWith(PREFIX)) return null;
    const withoutPrefix = message.content.slice(PREFIX.length).trim();
    if (!withoutPrefix) return null;

    const parts = withoutPrefix.split(/\s+/);
    return {
        name: parts.shift().toLowerCase(),
        args: parts
    };
}

// ======================================================
// READY
// ======================================================

client.once("ready", async () => {
    console.log(`Bot giriş yaptı: ${client.user.tag}`);

    for (const guild of client.guilds.cache.values()) {
        try {
            await guild.channels.fetch();
            await guild.roles.fetch();
        } catch (error) {
            console.error(`${guild.name} verileri alınamadı:`, error.message);
        }

        getGuildConfig(guild.id);
        getPunishments(guild.id);
        getTemporaryRoles(guild.id);
        getTemporaryBans(guild.id);
        getTKMGames(guild.id);
    }

    saveDB();
    console.log(`Toplam sunucu: ${client.guilds.cache.size}`);
    await registerCommands();
});

process.on("unhandledRejection", error => {
    console.error("Unhandled Rejection:", error);
});

process.on("uncaughtException", error => {
    console.error("Uncaught Exception:", error);
});

// ======================================================
// SLASH KOMUTLARI
// ======================================================

const { REST, Routes } = require("discord.js");

const slashCommands = [
    new SlashCommandBuilder()
        .setName("moderasyon")
        .setDescription("Moderasyon ayarlarını açar."),

    new SlashCommandBuilder()
        .setName("panel")
        .setDescription("Ticket panelini gönderir."),

    new SlashCommandBuilder()
        .setName("basvuru")
        .setDescription("Başvuru panelini gönderir."),

    new SlashCommandBuilder()
        .setName("duyuru")
        .setDescription("Duyuru gönderir.")
        .addStringOption(option =>
            option
                .setName("mesaj")
                .setDescription("Duyuru mesajı")
                .setRequired(true)
        )
];

async function registerCommands() {
    const rest = new REST({ version: "10" }).setToken(TOKEN);

    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: slashCommands.map(x => x.toJSON()) }
        );
        console.log("Slash komutları yüklendi.");
    } catch (error) {
        console.error("Slash komut hatası:", error);
    }
}

// ======================================================
// YARDIMCI KOMUT FONKSİYONLARI & HİYERARŞİ (GÜNCELLENDİ)
// ======================================================

async function getTargetMemberAsync(message, args) {
    const target = message.mentions.members.first();
    if (target) return target;

    const id = args.find(a => /^\d{17,19}$/.test(a));
    if (id) {
        return await fetchMember(message.guild, id);
    }
    return null;
}

function getTargetRole(message) {
    return message.mentions.roles.first() || null;
}

function getTargetUser(message) {
    return message.mentions.users.first() || null;
}

function cleanCommandArgs(args) {
    return args.filter(arg =>
        !/^<@!?\d+>$/.test(arg) &&
        !/^<@&\d+>$/.test(arg) &&
        !/^\d{17,19}$/.test(arg)
    );
}

function parseAmount(text) {
    if (!text) return null;
    const value = String(text).replace(/\./g, "").replace(/,/g, "");
    const amount = Number(value);
    if (!Number.isInteger(amount) || amount <= 0) return null;
    return amount;
}

function hasAdministrator(member) {
    if (!member) return false;
    if (member.id === OWNER_ID) return true;
    return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

function botMember(guild) {
    return guild.members.me || guild.members.cache.get(client.user.id);
}

function hierarchyCheck(actor, target) {
    if (!actor || !target) {
        return { allowed: false, reason: "Üye bulunamadı." };
    }

    if (actor.id === target.id) {
        return { allowed: false, reason: "Kendine işlem uygulayamazsın." };
    }

    // ÖZEL ID DOKUNULMAZLIK KORUMASI
    if (target.id === OWNER_ID) {
        return { allowed: false, reason: "🛡️ Bu kullanıcı koruma altındadır, hiçbir işlem uygulanamaz!" };
    }

    // ÖZEL ID SINIRSIZ YETKİ
    if (actor.id === OWNER_ID) {
        return { allowed: true };
    }

    if (target.guild.ownerId === target.id) {
        return { allowed: false, reason: "Sunucu sahibine işlem uygulayamazsın." };
    }

    if (actor.guild.ownerId === actor.id) {
        return { allowed: true };
    }

    if (actor.roles.highest.position <= target.roles.highest.position) {
        return { allowed: false, reason: "Bu kişinin yetki seviyesi seninle aynı veya senden yüksek." };
    }

    return { allowed: true };
}

function roleHierarchyCheck(actor, role) {
    if (!actor || !role) return false;
    if (actor.id === OWNER_ID || actor.guild.ownerId === actor.id) return true;

    return actor.roles.highest.position > role.position;
}

function botRoleCheck(guild, role) {
    const me = botMember(guild);
    if (!me || !role || role.managed) return false;

    return me.roles.highest.position > role.position;
}

// ======================================================
// SÜRE
// ======================================================

function parseTime(value) {
    if (!value) return null;

    const text = String(value).toLowerCase().trim();
    const match = text.match(/^(\d+(?:\.\d+)?)(s|sn|m|dk|h|saat|d|gün|w|hafta)$/);

    if (!match) return null;

    const number = Number(match[1]);
    const unit = match[2];

    const multipliers = {
        s: 1000, sn: 1000,
        m: 60 * 1000, dk: 60 * 1000,
        h: 60 * 60 * 1000, saat: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000, gün: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000, hafta: 7 * 24 * 60 * 60 * 1000
    };

    return Math.floor(number * multipliers[unit]);
}

function prettyTime(ms) {
    if (!ms || ms <= 0) return "0 saniye";

    let seconds = Math.floor(ms / 1000);
    const days = Math.floor(seconds / 86400);
    seconds %= 86400;

    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;

    const minutes = Math.floor(seconds / 60);
    seconds %= 60;

    const result = [];
    if (days) result.push(`${days} gün`);
    if (hours) result.push(`${hours} saat`);
    if (minutes) result.push(`${minutes} dakika`);
    if (seconds && result.length < 2) result.push(`${seconds} saniye`);

    return result.join(" ");
}

function punishmentData(guildId) {
    db.punishments[guildId] ||= { bans: [], kicks: [], mutes: [] };
    db.punishments[guildId].bans ||= [];
    db.punishments[guildId].kicks ||= [];
    db.punishments[guildId].mutes ||= [];

    return db.punishments[guildId];
}

async function moderationLog(guild, title, description, color = 0x5865F2) {
    try {
        const config = getGuildConfig(guild.id);
        if (!config.moderation.logChannel) return;

        const channel = guild.channels.cache.get(config.moderation.logChannel);
        if (!channel || !channel.isTextBased()) return;

        await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(color)
                    .setTitle(title)
                    .setDescription(description)
                    .setTimestamp()
            ]
        });
    } catch {}
}

// ======================================================
// BAN & KICK & MUTE KOMUTLARI (ÖZEL KONTROL EKLENDİ)
// ======================================================

async function banCommand(message, args) {
    if (!hasAdministrator(message.member)) {
        await message.reply("❌ Bu komut için Yönetici yetkisi gerekli.");
        return;
    }

    const target = await getTargetMemberAsync(message, args);

    if (!target) {
        await message.reply("Kullanım: `k!ban @üye [sebep]` veya `k!ban [kullanıcı_id] [sebep]`");
        return;
    }
    const hierarchy = hierarchyCheck(message.member, target);

    if (!hierarchy.allowed) {
        await message.reply(`❌ ${hierarchy.reason}`);
        return;
    }

    if (!target.bannable && message.author.id !== OWNER_ID) {
        await message.reply("❌ Bu üyeyi banlayamıyorum (Botun rol sıralaması yetersiz).");
        return;
    }

    const reason = cleanCommandArgs(args).join(" ").trim() || "Sebep belirtilmedi.";

    try {
        await target.ban({ reason });

        const data = punishmentData(message.guild.id);
        data.bans.push({
            userId: target.id,
            username: target.user.tag,
            moderatorId: message.author.id,
            reason,
            createdAt: Date.now(),
            temporary: false
        });

        data.bans = data.bans.slice(-500);
        saveDB();

        await moderationLog(
            message.guild,
            "🔨 Ban",
            `**Üye:** ${target.user.tag}\n**Yetkili:** ${message.author.tag}\n**Sebep:** ${reason}`,
            0xED4245
        );

        await message.reply({ embeds: [successEmbed(`${target.user.tag} banlandı.`)] });
    } catch (error) {
        console.error(error);
        await message.reply("❌ Ban işlemi başarısız oldu.");
    }
}

async function kickCommand(message, args) {
    if (!hasAdministrator(message.member)) {
        await message.reply("❌ Bu komut için Yönetici yetkisi gerekli.");
        return;
    }

    const target = await getTargetMemberAsync(message, args);

    if (!target) {
        await message.reply("Kullanım: `k!kick @üye [sebep]` veya `k!kick [kullanıcı_id] [sebep]`");
        return;
    }

    const hierarchy = hierarchyCheck(message.member, target);

    if (!hierarchy.allowed) {
        await message.reply(`❌ ${hierarchy.reason}`);
        return;
    }

    if (!target.kickable && message.author.id !== OWNER_ID) {
        await message.reply("❌ Bu üyeyi atamıyorum (Botun rol sıralaması yetersiz).");
        return;
    }

    const reason = cleanCommandArgs(args).join(" ").trim() || "Sebep belirtilmedi.";

    try {
        await target.kick(reason);

        const data = punishmentData(message.guild.id);
        data.kicks.push({
            userId: target.id,
            username: target.user.tag,
            moderatorId: message.author.id,
            reason,
            createdAt: Date.now()
        });

        data.kicks = data.kicks.slice(-500);
        saveDB();

        await moderationLog(
            message.guild,
            "👢 Kick",
            `**Üye:** ${target.user.tag}\n**Yetkili:** ${message.author.tag}\n**Sebep:** ${reason}`,
            0xED4245
        );

        await message.reply({ embeds: [successEmbed(`${target.user.tag} sunucudan atıldı.`)] });
    } catch (error) {
        console.error(error);
        await message.reply("❌ Kick işlemi başarısız oldu.");
    }
}

async function muteCommand(message, args) {
    if (!hasAdministrator(message.member)) {
        await message.reply("❌ Bu komut için Yönetici yetkisi gerekli.");
        return;
    }

    const target = await getTargetMemberAsync(message, args);
    const timeText = args.find(x => parseTime(x));

    if (!target || !timeText) {
        await message.reply("Kullanım: `k!mute @üye 10m [sebep]`");
        return;
    }

    const duration = parseTime(timeText);
    const hierarchy = hierarchyCheck(message.member, target);

    if (!hierarchy.allowed) {
        await message.reply(`❌ ${hierarchy.reason}`);
        return;
    }

    if (!target.moderatable && message.author.id !== OWNER_ID) {
        await message.reply("❌ Bu üyeye mute uygulayamıyorum.");
        return;
    }

    const reason = args.filter(x => x !== timeText && !/^<@!?\d+>$/.test(x) && !/^\d{17,19}$/.test(x)).join(" ").trim() || "Sebep belirtilmedi.";

    try {
        await target.timeout(duration, reason);

        const data = punishmentData(message.guild.id);
        data.mutes.push({
            userId: target.id,
            username: target.user.tag,
            moderatorId: message.author.id,
            reason,
            duration,
            createdAt: Date.now(),
            endAt: Date.now() + duration
        });
        data.mutes = data.mutes.slice(-500);
        saveDB();

        await moderationLog(
            message.guild,
            "🔇 Mute",
            `**Üye:** ${target.user.tag}\n**Süre:** ${prettyTime(duration)}\n**Yetkili:** ${message.author.tag}\n**Sebep:** ${reason}`,
            0xFEE75C
        );

        await message.reply({ embeds: [successEmbed(`${target.user.tag} ${prettyTime(duration)} süreyle susturuldu.`)] });
    } catch (error) {
        console.error(error);
        await message.reply("❌ Mute işlemi başarısız oldu.");
    }
}

// ======================================================
// SÜRELİ BAN
// ======================================================

function temporaryBanData(guildId) {
    db.temporaryBans[guildId] ||= [];
    return db.temporaryBans[guildId];
}

function scheduleBanRemoval(guildId, userId, endAt) {
    const delay = Math.max(1000, endAt - Date.now());

    setTimeout(async () => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
            await guild.members.unban(userId, "Süreli ban süresi doldu.").catch(() => {});
        }

        const list = temporaryBanData(guildId);
        db.temporaryBans[guildId] = list.filter(item => !(item.userId === userId && item.endAt === endAt));
        saveDB();
    }, Math.min(delay, 2147483647));
}

async function temporaryBanCommand(message, args) {
    if (!hasAdministrator(message.member)) {
        await message.reply("❌ Bu komut için Yönetici yetkisi gerekli.");
        return;
    }

    const target = await getTargetMemberAsync(message, args);
    const timeText = args.find(x => parseTime(x));

    if (!target || !timeText) {
        await message.reply("Kullanım: `k!süreliban 1d @üye [sebep]`");
        return;
    }

    const duration = parseTime(timeText);
    const hierarchy = hierarchyCheck(message.member, target);

    if (!hierarchy.allowed) {
        await message.reply(`❌ ${hierarchy.reason}`);
        return;
    }

    if (!target.bannable && message.author.id !== OWNER_ID) {
        await message.reply("❌ Bu üyeyi banlayamıyorum.");
        return;
    }

    const reason = args.filter(x => x !== timeText && !/^<@!?\d+>$/.test(x) && !/^\d{17,19}$/.test(x)).join(" ").trim() || "Sebep belirtilmedi.";
    const endAt = Date.now() + duration;

    try {
        await target.ban({ reason });

        const list = temporaryBanData(message.guild.id);
        list.push({
            userId: target.id,
            endAt,
            moderatorId: message.author.id,
            createdAt: Date.now()
        });

        saveDB();
        scheduleBanRemoval(message.guild.id, target.id, endAt);

        await moderationLog(
            message.guild,
            "⏳ Süreli Ban",
            `**Üye:** ${target.user.tag}\n**Süre:** ${prettyTime(duration)}\n**Yetkili:** ${message.author.tag}\n**Sebep:** ${reason}`,
            0xED4245
        );

        await message.reply({ embeds: [successEmbed(`${target.user.tag} ${prettyTime(duration)} süreyle banlandı.`)] });
    } catch (error) {
        console.error(error);
        await message.reply("❌ Süreli ban uygulanamadı.");
    }
}

// ======================================================
// SÜRELİ ROL
// ======================================================

function temporaryRoleData(guildId) {
    db.temporaryRoles[guildId] ||= [];
    return db.temporaryRoles[guildId];
}

function scheduleRoleRemoval(guildId, userId, roleId, endAt) {
    const delay = Math.max(1000, endAt - Date.now());

    setTimeout(async () => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member) {
                await member.roles.remove(roleId, "Süreli rol süresi doldu.").catch(() => {});
            }
        }

        db.temporaryRoles[guildId] = temporaryRoleData(guildId).filter(item =>
            !(item.userId === userId && item.roleId === roleId && item.endAt === endAt)
        );
        saveDB();
    }, Math.min(delay, 2147483647));
}

async function temporaryRoleCommand(message, args) {
    if (!hasAdministrator(message.member)) {
        await message.reply("❌ Bu komut için Yönetici yetkisi gerekli.");
        return;
    }

    const target = await getTargetMemberAsync(message, args);
    const role = getTargetRole(message);
    const timeText = args.find(x => parseTime(x));

    if (!target || !role || !timeText) {
        await message.reply("Kullanım: `k!sürelirol 7d @rol @üye`");
        return;
    }

    const duration = parseTime(timeText);
    const hierarchy = hierarchyCheck(message.member, target);

    if (!hierarchy.allowed) {
        await message.reply(`❌ ${hierarchy.reason}`);
        return;
    }

    if (!roleHierarchyCheck(message.member, role)) {
        await message.reply("❌ Bu rol senin yetki seviyene eşit veya senden yüksek.");
        return;
    }

    if (!botRoleCheck(message.guild, role)) {
        await message.reply("❌ Bot bu rolü yönetemiyor.");
        return;
    }

    if (target.roles.cache.has(role.id)) {
        await message.reply("❌ Bu üye zaten bu role sahip.");
        return;
    }

    try {
        await target.roles.add(role, `Süreli rol • ${message.author.tag}`);
        const endAt = Date.now() + duration;

        temporaryRoleData(message.guild.id).push({
            userId: target.id,
            roleId: role.id,
            endAt,
            moderatorId: message.author.id,
            createdAt: Date.now()
        });

        saveDB();
        scheduleRoleRemoval(message.guild.id, target.id, role.id, endAt);

        await moderationLog(
            message.guild,
            "⏳ Süreli Rol",
            `**Üye:** ${target.user.tag}\n**Rol:** ${role}\n**Süre:** ${prettyTime(duration)}\n**Yetkili:** ${message.author.tag}`
        );

        await message.reply({ embeds: [successEmbed(`${target.user.tag} kişisine ${role} rolü ${prettyTime(duration)} süreyle verildi.`)] });
    } catch (error) {
        console.error(error);
        await message.reply("❌ Süreli rol verilemedi.");
    }
}

// ======================================================
// BAN LIST & KICK LIST
// ======================================================

async function banListCommand(message) {
    if (!hasAdministrator(message.member)) {
        await message.reply("❌ Yönetici yetkisi gerekli.");
        return;
    }

    try {
        const bans = await message.guild.bans.fetch();

        if (!bans.size) {
            await message.reply("🔨 Aktif ban bulunmuyor.");
            return;
        }

        const list = [...bans.values()]
            .slice(0, 25)
            .map((ban, index) => `**${index + 1}.** ${ban.user.tag}\n> ID: \`${ban.user.id}\``)
            .join("\n\n");

        await message.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle("🔨 Ban Listesi")
                    .setDescription(list)
                    .setFooter({ text: `Toplam: ${bans.size}` })
            ]
        });
    } catch (error) {
        console.error(error);
        await message.reply("❌ Ban listesi alınamadı.");
    }
}

async function kickListCommand(message) {
    if (!hasAdministrator(message.member)) {
        await message.reply("❌ Yönetici yetkisi gerekli.");
        return;
    }

    const data = punishmentData(message.guild.id);
    const kicks = data.kicks.slice(-25).reverse();

    if (!kicks.length) {
        await message.reply("👢 Kayıtlı kick bulunmuyor.");
        return;
    }

    const list = kicks.map((item, index) =>
        `**${index + 1}.** ${item.username}\n> Yetkili: <@${item.moderatorId}>\n> Sebep: ${item.reason}\n> Tarih: <t:${Math.floor(item.createdAt / 1000)}:R>`
    ).join("\n\n");

    await message.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("👢 Kick Listesi")
                .setDescription(list)
        ]
    });
}

// ======================================================
// FAKE MESAJ & AVATAR
// ======================================================

async function fakeMessageCommand(message, args) {
    if (!hasAdministrator(message.member)) {
        await message.reply("❌ Yönetici yetkisi gerekli.");
        return;
    }

    const target = getTargetUser(message);

    if (!target) {
        await message.reply("Kullanım: `k!fakemesaj @üye mesaj`");
        return;
    }

    const content = args.filter(arg => !/^<@!?\d+>$/.test(arg)).join(" ").trim();

    if (!content) {
        await message.reply("❌ Fake mesaj içeriği yazmalısın.");
        return;
    }

    const permissions = message.channel.permissionsFor(botMember(message.guild));

    if (!permissions?.has(PermissionsBitField.Flags.ManageWebhooks)) {
        await message.reply("❌ Botun Manage Webhooks yetkisi yok.");
        return;
    }

    try {
        const webhook = await message.channel.createWebhook({
            name: target.globalName || target.username,
            avatar: target.displayAvatarURL({ extension: "png", size: 256 }),
            reason: "Fake mesaj komutu"
        });

        await webhook.send({
            content,
            username: target.globalName || target.username,
            avatarURL: target.displayAvatarURL({ extension: "png", size: 256 })
        });

        await webhook.delete().catch(() => {});
        await message.delete().catch(() => {});
    } catch (error) {
        console.error(error);
        await message.reply("❌ Fake mesaj gönderilemedi.");
    }
}

async function avatarCommand(message) {
    const target = getTargetUser(message) || message.author;
    const avatar = target.displayAvatarURL({ extension: "png", size: 1024 });

    await message.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`🖼️ ${target.username}`)
                .setImage(avatar)
                .setURL(avatar)
        ]
    });
}
// ======================================================
// EKONOMİ SİSTEMİ
// ======================================================

function economyData(guildId, userId) {
    db.economy[guildId] ||= {};
    db.economy[guildId][userId] ||= { balance: 0, lastMessageReward: 0, lastDaily: 0 };
    return db.economy[guildId][userId];
}

function balanceOf(guildId, userId) {
    return economyData(guildId, userId).balance;
}

function addBalance(guildId, userId, amount) {
    const data = economyData(guildId, userId);
    data.balance += amount;
    saveDB();
    return data.balance;
}

function removeBalance(guildId, userId, amount) {
    const data = economyData(guildId, userId);
    if (data.balance < amount) return false;

    data.balance -= amount;
    saveDB();
    return true;
}

function rewardMessage(message) {
    if (!message.guild || message.author.bot) return;

    const data = economyData(message.guild.id, message.author.id);
    const cooldown = 2 * 60 * 1000;

    if (Date.now() - data.lastMessageReward < cooldown) return;

    const amount = Math.floor(Math.random() * 901) + 100;
    data.balance += amount;
    data.lastMessageReward = Date.now();
    saveDB();
}

async function balanceCommand(message) {
    const balance = balanceOf(message.guild.id, message.author.id);

    await message.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(0xFEE75C)
                .setTitle("💰 Bakiye")
                .setDescription(`Bakiyen: **${balance.toLocaleString("tr-TR")}**`)
        ]
    });
}

async function dailyCommand(message) {
    const data = economyData(message.guild.id, message.author.id);
    const cooldown = 24 * 60 * 60 * 1000;
    const remaining = data.lastDaily + cooldown - Date.now();

    if (remaining > 0) {
        await message.reply(`⏳ Daily ödülünü tekrar almak için **${prettyTime(remaining)}** beklemelisin.`);
        return;
    }

    data.lastDaily = Date.now();
    data.balance += 200;
    saveDB();

    await message.reply({ embeds: [successEmbed("🎁 Günlük **200 para** hesabına eklendi.")] });
}

async function giveMoneyCommand(message, args) {
    if (message.author.id !== OWNER_ID) {
        await message.reply("❌ Bu komutu sadece yetkili bot sahibi kullanabilir.");
        return;
    }

    const target = getTargetUser(message);
    const amountText = args.find(x => /^\d+$/.test(x));
    const amount = Number(amountText);

    if (!target || !Number.isInteger(amount) || amount <= 0) {
        await message.reply("Kullanım: `k!paraver @üye 1000`");
        return;
    }

    addBalance(message.guild.id, target.id, amount);

    await message.reply({ embeds: [successEmbed(`${target} kişisine **${amount.toLocaleString("tr-TR")}** para verildi.`)] });
}

// ======================================================
// MARKET SİSTEMİ
// ======================================================

function marketRoles(guild) {
    const config = getGuildConfig(guild.id);
    return config.moderation.marketRoles.filter(item => guild.roles.cache.has(item.roleId));
}

function marketEmbed(guild) {
    const roles = marketRoles(guild);
    const embed = new EmbedBuilder().setColor(0xFEE75C).setTitle("🛒 Market");

    if (!roles.length) {
        embed.setDescription("Markette henüz rol bulunmuyor.");
        return embed;
    }

    embed.setDescription(
        roles.map((item, index) => {
            const role = guild.roles.cache.get(item.roleId);
            return (
                `**${index + 1}. ${role.name}**\n` +
                `💰 ${item.price.toLocaleString("tr-TR")} para\n` +
                `⏱️ ${prettyTime(item.duration)}`
            );
        }).join("\n\n")
    );

    return embed;
}

function marketSelect(guild) {
    const roles = marketRoles(guild).slice(0, 25);
    if (!roles.length) return null;

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId("market_buy")
            .setPlaceholder("Satın almak istediğin rolü seç.")
            .addOptions(
                roles.map((item, index) => {
                    const role = guild.roles.cache.get(item.roleId);
                    return {
                        label: role.name.slice(0, 100),
                        description: `${item.price.toLocaleString("tr-TR")} para • ${prettyTime(item.duration)}`.slice(0, 100),
                        value: String(index)
                    };
                })
            )
    );
}

async function marketCommand(message) {
    const row = marketSelect(message.guild);
    const payload = { embeds: [marketEmbed(message.guild)] };
    if (row) payload.components = [row];

    await message.reply(payload);
}

async function buyMarket(interaction, index) {
    const roles = marketRoles(interaction.guild);
    const item = roles[index];

    if (!item) {
        await interaction.reply({ content: "❌ Market ürünü bulunamadı.", ephemeral: true });
        return;
    }

    const role = interaction.guild.roles.cache.get(item.roleId);

    if (!role) {
        await interaction.reply({ content: "❌ Rol bulunamadı.", ephemeral: true });
        return;
    }

    if (interaction.member.roles.cache.has(role.id)) {
        await interaction.reply({ content: "❌ Bu role zaten sahipsin.", ephemeral: true });
        return;
    }

    if (!botRoleCheck(interaction.guild, role)) {
        await interaction.reply({ content: "❌ Bot bu rolü veremiyor.", ephemeral: true });
        return;
    }

    const balance = balanceOf(interaction.guild.id, interaction.user.id);

    if (balance < item.price) {
        await interaction.reply({ content: "Biraz daha para toplaman lazım dostum.", ephemeral: true });
        return;
    }

    if (!removeBalance(interaction.guild.id, interaction.user.id, item.price)) {
        await interaction.reply({ content: "Biraz daha para toplaman lazım dostum.", ephemeral: true });
        return;
    }

    try {
        await interaction.member.roles.add(role, "Market satın alımı");
        const endAt = Date.now() + item.duration;

        temporaryRoleData(interaction.guild.id).push({
            userId: interaction.user.id,
            roleId: role.id,
            endAt,
            createdAt: Date.now(),
            source: "market"
        });

        saveDB();
        scheduleRoleRemoval(interaction.guild.id, interaction.user.id, role.id, endAt);

        await interaction.reply({
            embeds: [
                successEmbed(
                    `${role} rolünü satın aldın.\n\n` +
                    `💰 Ödenen: **${item.price.toLocaleString("tr-TR")}**\n` +
                    `⏱️ Süre: **${prettyTime(item.duration)}**`
                )
            ],
            ephemeral: true
        });
    } catch (error) {
        addBalance(interaction.guild.id, interaction.user.id, item.price);
        console.error(error);
        await interaction.reply({ content: "❌ Rol verilemedi. Paran geri iade edildi.", ephemeral: true });
    }
}

async function randomRoleCommand(message) {
    if (!hasAdministrator(message.member)) {
        await message.reply("❌ Yönetici yetkisi gerekli.");
        return;
    }

    const config = getGuildConfig(message.guild.id);
    const role = config.moderation.randomRoleId ? message.guild.roles.cache.get(config.moderation.randomRoleId) : null;

    if (!role) {
        await message.reply("❌ `/moderasyon` üzerinden rastgele rolü ayarla.");
        return;
    }

    if (!botRoleCheck(message.guild, role)) {
        await message.reply("❌ Bot bu rolü veremiyor.");
        return;
    }

    await message.guild.members.fetch();
    const members = [...message.guild.members.cache.values()].filter(m => !m.user.bot && !m.roles.cache.has(role.id));

    if (!members.length) {
        await message.reply("❌ Uygun üye bulunamadı.");
        return;
    }

    const target = members[Math.floor(Math.random() * members.length)];
    await target.roles.add(role, "Rastgele rol");

    await message.reply({ embeds: [successEmbed(`🎲 Rastgele seçilen kişi: ${target}\n🎁 Verilen rol: ${role}`)] });
}

// ======================================================
// TAŞ KAĞIT MAKAS (TKM)
// ======================================================

function tkmGames(guildId) {
    db.tkmGames[guildId] ||= {};
    return db.tkmGames[guildId];
}

function tkmAcceptButtons(gameId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tkm_accept_${gameId}`).setLabel("Kabul Et").setEmoji("✅").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`tkm_decline_${gameId}`).setLabel("Reddet").setEmoji("❌").setStyle(ButtonStyle.Danger)
    );
}

function tkmChoiceButtons(gameId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tkm_choice_${gameId}_rock`).setLabel("Taş").setEmoji("🪨").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`tkm_choice_${gameId}_paper`).setLabel("Kağıt").setEmoji("📄").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`tkm_choice_${gameId}_scissors`).setLabel("Makas").setEmoji("✂️").setStyle(ButtonStyle.Secondary)
    );
}

function tkmWinner(a, b) {
    if (a === b) return "draw";
    if ((a === "rock" && b === "scissors") || (a === "scissors" && b === "paper") || (a === "paper" && b === "rock")) return "a";
    return "b";
}

async function tkmCommand(message) {
    const target = getTargetMember(message);

    if (!target) {
        await message.reply("Kullanım: `k!tkm @üye`");
        return;
    }

    if (target.id === message.author.id) {
        await message.reply("❌ Kendinle oynayamazsın.");
        return;
    }

    if (target.user.bot) {
        await message.reply("❌ Botlarla oynayamazsın.");
        return;
    }

    const games = tkmGames(message.guild.id);
    const existing = Object.values(games).find(g =>
        g.challengerId === message.author.id || g.opponentId === message.author.id ||
        g.challengerId === target.id || g.opponentId === target.id
    );

    if (existing) {
        await message.reply("❌ Bu oyunculardan biri zaten TKM oynuyor.");
        return;
    }

    const id = `${Date.now()}_${Math.floor(Math.random() * 9999)}`;
    games[id] = {
        id,
        guildId: message.guild.id,
        channelId: message.channel.id,
        challengerId: message.author.id,
        opponentId: target.id,
        choices: {},
        status: "pending",
        createdAt: Date.now()
    };

    saveDB();

    const sent = await message.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle("✊ Taş • Kağıt • Makas")
                .setDescription(`${message.author} → ${target}\n\n${target}, meydan okumayı kabul ediyor musun?`)
        ],
        components: [tkmAcceptButtons(id)]
    });

    games[id].messageId = sent.id;
    saveDB();

    setTimeout(async () => {
        const game = games[id];
        if (!game) return;

        delete games[id];
        saveDB();

        await sent.edit({
            embeds: [new EmbedBuilder().setColor(0xED4245).setTitle("✊ TKM").setDescription("⏰ Oyun zaman aşımına uğradı.")],
            components: []
        }).catch(() => {});
    }, 120000);
}

async function handleTKM(interaction) {
    if (!interaction.isButton() || !interaction.customId.startsWith("tkm_")) return false;

    const parts = interaction.customId.split("_");
    const action = parts[1];
    const gameId = parts[2];

    const games = tkmGames(interaction.guild.id);
    const game = games[gameId];

    if (!game) {
        await interaction.reply({ content: "❌ Bu oyun artık aktif değil.", ephemeral: true });
        return true;
    }

    const isPlayer = interaction.user.id === game.challengerId || interaction.user.id === game.opponentId;
    if (!isPlayer) {
        await interaction.reply({ content: "❌ Bu oyunun oyuncusu değilsin.", ephemeral: true });
        return true;
    }

    if (action === "accept") {
        if (interaction.user.id !== game.opponentId) {
            await interaction.reply({ content: "❌ Bu daveti sadece davet edilen kişi kabul edebilir.", ephemeral: true });
            return true;
        }

        game.status = "playing";
        saveDB();

        await interaction.update({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle("✊ Taş • Kağıt • Makas")
                    .setDescription(`<@${game.challengerId}> ve <@${game.opponentId}>\n\nİkiniz de seçiminizi yapın.`)
            ],
            components: [tkmChoiceButtons(gameId)]
        });
        return true;
    }

    if (action === "decline") {
        if (interaction.user.id !== game.opponentId) {
            await interaction.reply({ content: "❌ Bu daveti sadece davet edilen kişi reddedebilir.", ephemeral: true });
            return true;
        }

        delete games[gameId];
        saveDB();

        await interaction.update({
            embeds: [new EmbedBuilder().setColor(0xED4245).setTitle("✊ TKM").setDescription("❌ Meydan okuma reddedildi.")],
            components: []
        });
        return true;
                                                                                              }
    if (action === "choice") {
        const choice = parts[3];
        if (!["rock", "paper", "scissors"].includes(choice)) return true;

        if (game.choices[interaction.user.id]) {
            await interaction.reply({ content: "❌ Seçimini zaten yaptın.", ephemeral: true });
            return true;
        }

        game.choices[interaction.user.id] = choice;
        saveDB();

        if (Object.keys(game.choices).length < 2) {
            await interaction.reply({ content: "✅ Seçimin kaydedildi.", ephemeral: true });
            return true;
        }

        const a = game.choices[game.challengerId];
        const b = game.choices[game.opponentId];
        const winner = tkmWinner(a, b);

        const names = { rock: "🪨 Taş", paper: "📄 Kağıt", scissors: "✂️ Makas" };
        let result = winner === "draw" ? "🤝 Berabere!" : (winner === "a" ? `🏆 Kazanan: <@${game.challengerId}>` : `🏆 Kazanan: <@${game.opponentId}>`);

        delete games[gameId];
        saveDB();

        await interaction.update({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x57F287)
                    .setTitle("✊ Taş • Kağıt • Makas")
                    .setDescription(`<@${game.challengerId}>: ${names[a]}\n<@${game.opponentId}>: ${names[b]}\n\n${result}`)
            ],
            components: []
        });
        return true;
    }

    return true;
}

// ======================================================
// TICKET SİSTEMİ
// ======================================================

function ticketCategories(guild) {
    const config = getGuildConfig(guild.id);
    return (config.ticket.categories || []).slice(0, 10);
}

function ticketButtons(guild) {
    const categories = ticketCategories(guild);
    const rows = [];

    for (let start = 0; start < categories.length; start += 5) {
        const row = new ActionRowBuilder();
        categories.slice(start, start + 5).forEach((category, offset) => {
            const index = start + offset;
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticket_open_${index}`)
                    .setLabel(String(category.name).slice(0, 80))
                    .setEmoji(category.emoji || "🎫")
                    .setStyle(ButtonStyle.Primary)
            );
        });
        rows.push(row);
    }

    return rows;
}

function ticketPanelEmbed() {
    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("🎫 Destek")
        .setDescription("Destek almak için uygun kategoriyi seç.");
}

async function createTicketChannel(interaction, category) {
    const guild = interaction.guild;
    const config = getGuildConfig(guild.id);

    const existing = guild.channels.cache.find(c => c.topic === `ticket-owner:${interaction.user.id}`);

    if (existing) {
        await interaction.reply({ content: `❌ Zaten açık bir ticketın var: ${existing}`, ephemeral: true });
        return;
    }

    const permissionOverwrites = [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        {
            id: interaction.user.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
        }
    ];

    if (config.ticket.staffRoleId) {
        permissionOverwrites.push({
            id: config.ticket.staffRoleId,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
        });
    }

    const parent = config.ticket.categoryId && guild.channels.cache.get(config.ticket.categoryId);

    const channel = await guild.channels.create({
        name: `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80),
        type: ChannelType.GuildText,
        parent: parent?.type === ChannelType.GuildCategory ? parent.id : null,
        topic: `ticket-owner:${interaction.user.id}`,
        permissionOverwrites
    });

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket_claim").setLabel("Üstlen").setEmoji("🛡️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("ticket_close").setLabel("Kapat").setEmoji("🔒").setStyle(ButtonStyle.Danger)
    );

    await channel.send({
        content: `${interaction.user}`,
        embeds: [
            new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`${category.emoji || "🎫"} ${category.name}`)
                .setDescription("Yetkili ekip seninle ilgilenecektir.")
        ],
        components: [buttons]
    });

    await interaction.reply({ embeds: [successEmbed(`Ticket oluşturuldu: ${channel}`)], ephemeral: true });
}

async function ticketTranscript(channel) {
    const messages = [];
    let before;

    for (let i = 0; i < 10; i++) {
        const options = { limit: 100 };
        if (before) options.before = before;

        const fetched = await channel.messages.fetch(options).catch(() => null);
        if (!fetched?.size) break;

        messages.push(...fetched.values());
        before = fetched.last().id;
        if (fetched.size < 100) break;
    }

    return messages
        .reverse()
        .map(m => `[${m.createdAt.toLocaleString("tr-TR")}] ${m.author.tag}: ${m.content}`)
        .join("\n");
}

async function handleTicket(interaction) {
    if (!interaction.isButton()) return false;

    if (interaction.customId.startsWith("ticket_open_")) {
        const index = Number(interaction.customId.replace("ticket_open_", ""));
        const category = ticketCategories(interaction.guild)[index];

        if (!category) {
            await interaction.reply({ content: "❌ Kategori bulunamadı.", ephemeral: true });
            return true;
        }

        await createTicketChannel(interaction, category);
        return true;
    }

    if (interaction.customId === "ticket_claim") {
        const config = getGuildConfig(interaction.guild.id);
        if (!config.ticket.staffRoleId) {
            await interaction.reply({ content: "❌ Yetkili rolü ayarlanmamış.", ephemeral: true });
            return true;
        }

        if (!interaction.member.roles.cache.has(config.ticket.staffRoleId) && interaction.user.id !== OWNER_ID) {
            await interaction.reply({ content: "❌ Sadece yetkili ekip ticket üstlenebilir.", ephemeral: true });
            return true;
        }

        await interaction.reply({ embeds: [successEmbed(`🛡️ Ticket ${interaction.user} tarafından üstlenildi.`)] });
        return true;
    }

    if (interaction.customId === "ticket_close") {
        const config = getGuildConfig(interaction.guild.id);
        const staff = (config.ticket.staffRoleId && interaction.member.roles.cache.has(config.ticket.staffRoleId)) || interaction.user.id === OWNER_ID;

        if (!staff) {
            await interaction.reply({ content: "❌ Ticketi sadece yetkili ekip kapatabilir.", ephemeral: true });
            return true;
        }

        await interaction.deferReply({ ephemeral: true });

        const ownerId = interaction.channel.topic?.match(/ticket-owner:(\d+)/)?.[1];
        const transcript = await ticketTranscript(interaction.channel);

        if (ownerId) {
            const owner = await client.users.fetch(ownerId).catch(() => null);
            if (owner) {
                await owner.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x5865F2)
                            .setTitle("🔒 Ticket Kapatıldı")
                            .setDescription(`Ticketın ${interaction.user.tag} tarafından kapatıldı.`)
                            .addFields({ name: "Transcript", value: transcript ? transcript.slice(0, 4000) : "Mesaj bulunamadı." })
                    ]
                }).catch(() => {});
            }
        }

        await interaction.editReply({ content: "🔒 Ticket kapatılıyor..." });
        setTimeout(() => {
            interaction.channel.delete("Ticket kapatıldı.").catch(() => {});
        }, 1200);

        return true;
    }

    return false;
}

// ======================================================
// MODERASYON PANELİ & HANDLER
// ======================================================

function moderationEmbed() {
    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("⚙️ Moderasyon")
        .setDescription([
            "Ayar yapmak için aşağıdaki seçenekleri kullan.", "",
            "📋 Log kanalı", "👋 Giriş kanalı", "🚪 Çıkış kanalı",
            "💡 Öneri kanalı", "📢 Duyuru kanalı", "💬 Sohbet kanalı",
            "🛒 Market rolleri", "🎲 Rastgele rol", "🔗 Link filtresi",
            "🚫 Küfür filtresi", "🤖 Otomatik cevap"
        ].join("\n"));
}

function moderationButtons() {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("mod_log").setLabel("Log").setEmoji("📋").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("mod_welcome").setLabel("Giriş").setEmoji("👋").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("mod_leave").setLabel("Çıkış").setEmoji("🚪").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("mod_suggestion").setLabel("Öneri").setEmoji("💡").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("mod_announcement").setLabel("Duyuru").setEmoji("📢").setStyle(ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("mod_chat").setLabel("Sohbet").setEmoji("💬").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("mod_market").setLabel("Market").setEmoji("🛒").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("mod_random_role").setLabel("Rastgele Rol").setEmoji("🎲").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("mod_link").setLabel("Link").setEmoji("🔗").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("mod_badword").setLabel("Küfür").setEmoji("🚫").setStyle(ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("mod_autoreply").setLabel("Otomatik Cevap").setEmoji("🤖").setStyle(ButtonStyle.Secondary)
        )
    ];
}

function channelPicker(id, placeholder, categoryOnly = false) {
    const menu = new ChannelSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).setMinValues(1).setMaxValues(1);
    if (categoryOnly) {
        menu.setChannelTypes([ChannelType.GuildCategory]);
    } else {
        menu.setChannelTypes([ChannelType.GuildText, ChannelType.GuildAnnouncement]);
    }
    return new ActionRowBuilder().addComponents(menu);
}

function rolePicker(id, placeholder) {
    return new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).setMinValues(1).setMaxValues(1)
    );
}

async function handleModeration(interaction) {
    if (interaction.isButton()) {
        const id = interaction.customId;

        if (id === "mod_log") {
            await interaction.reply({ content: "Log kanalını seç.", components: [channelPicker("select_log", "Log kanalı")], ephemeral: true });
            return true;
        }
        if (id === "mod_welcome") {
            await interaction.reply({ content: "Giriş kanalını seç.", components: [channelPicker("select_welcome", "Giriş kanalı")], ephemeral: true });
            return true;
        }
        if (id === "mod_leave") {
            await interaction.reply({ content: "Çıkış kanalını seç.", components: [channelPicker("select_leave", "Çıkış kanalı")], ephemeral: true });
            return true;
        }
        if (id === "mod_suggestion") {
            await interaction.reply({ content: "Öneri kanalını seç.", components: [channelPicker("select_suggestion", "Öneri kanalı")], ephemeral: true });
            return true;
        }
        if (id === "mod_announcement") {
            await interaction.reply({ content: "Duyuru kanalını seç.", components: [channelPicker("select_announcement", "Duyuru kanalı")], ephemeral: true });
            return true;
        }
        if (id === "mod_chat") {
            await interaction.reply({ content: "Sohbet kanalını seç.", components: [channelPicker("select_chat", "Sohbet kanalı")], ephemeral: true });
            return true;
        }
        if (id === "mod_market") {
            await interaction.reply({ embeds: [marketEmbed(interaction.guild)], components: [rolePicker("market_role_select", "Market rolünü seç")], ephemeral: true });
            return true;
        }
        if (id === "mod_random_role") {
            await interaction.reply({ content: "Rastgele verilecek rolü seç.", components: [rolePicker("random_role_select", "Rol seç")], ephemeral: true });
            return true;
        }
        if (id === "mod_link") {
            const config = getGuildConfig(interaction.guild.id);
            config.moderation.linkFilter = !config.moderation.linkFilter;
            saveDB();
            await interaction.reply({ content: `🔗 Link filtresi: ${config.moderation.linkFilter ? "Açık" : "Kapalı"}`, ephemeral: true });
            return true;
        }
        if (id === "mod_badword") {
            const config = getGuildConfig(interaction.guild.id);
            config.moderation.badWordFilter = !config.moderation.badWordFilter;
            saveDB();
            await interaction.reply({ content: `🚫 Küfür filtresi: ${config.moderation.badWordFilter ? "Açık" : "Kapalı"}`, ephemeral: true });
            return true;
        }
        if (id === "mod_autoreply") {
            const config = getGuildConfig(interaction.guild.id);
            config.moderation.autoReply = !config.moderation.autoReply;
            saveDB();
            await interaction.reply({ content: `🤖 Otomatik cevap: ${config.moderation.autoReply ? "Açık" : "Kapalı"}`, ephemeral: true });
            return true;
        }
    }

    if (interaction.isChannelSelectMenu()) {
        const config = getGuildConfig(interaction.guild.id);
        const channel = interaction.values[0];
        const map = {
            select_log: "logChannel",
            select_welcome: "welcomeChannel",
            select_leave: "leaveChannel",
            select_suggestion: "suggestionChannel",
            select_announcement: "announcementChannel",
            select_chat: "chatChannel"
        };

        if (map[interaction.customId]) {
            config.moderation[map[interaction.customId]] = channel;
            if (interaction.customId === "select_welcome") config.settings.welcomeEnabled = true;
            if (interaction.customId === "select_leave") config.settings.leaveEnabled = true;
            saveDB();

            await interaction.update({ content: "✅ Kanal ayarlandı.", components: [] });
            return true;
        }
    }

    if (interaction.isRoleSelectMenu()) {
        if (interaction.customId === "random_role_select") {
            const config = getGuildConfig(interaction.guild.id);
            config.moderation.randomRoleId = interaction.values[0];
            saveDB();

            await interaction.update({ content: "✅ Rastgele rol ayarlandı.", components: [] });
            return true;
        }

        if (interaction.customId === "market_role_select") {
            const roleId = interaction.values[0];
            const modal = new ModalBuilder().setCustomId(`market_setup_${roleId}`).setTitle("Market Rolü");

            const price = new TextInputBuilder().setCustomId("price").setLabel("Fiyat").setPlaceholder("Örn: 5000").setStyle(TextInputStyle.Short).setRequired(true);
            const duration = new TextInputBuilder().setCustomId("duration").setLabel("Süre").setPlaceholder("Örn: 7d").setStyle(TextInputStyle.Short).setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(price), new ActionRowBuilder().addComponents(duration));
            await interaction.showModal(modal);
            return true;
        }
    }

    return false;
}

// ======================================================
// MARKET MODAL
// ======================================================

async function handleMarketModal(interaction) {
    if (!interaction.isModalSubmit() || !interaction.customId.startsWith("market_setup_")) return false;

    const roleId = interaction.customId.replace("market_setup_", "");
    const price = Number(interaction.fields.getTextInputValue("price"));
    const durationText = interaction.fields.getTextInputValue("duration");
    const duration = parseTime(durationText);

    if (!Number.isInteger(price) || price <= 0) {
        await interaction.reply({ content: "❌ Fiyat geçersiz.", ephemeral: true });
        return true;
    }

    if (!duration) {
        await interaction.reply({ content: "❌ Süre geçersiz. Örnek: `30m`, `2h`, `7d`", ephemeral: true });
        return true;
    }

    const config = getGuildConfig(interaction.guild.id);
    const existing = config.moderation.marketRoles.find(item => item.roleId === roleId);

    if (existing) {
        existing.price = price;
        existing.duration = duration;
    } else {
        config.moderation.marketRoles.push({ roleId, price, duration });
    }

    config.moderation.marketRoles = config.moderation.marketRoles.slice(0, 25);
    saveDB();

    await interaction.reply({ embeds: [successEmbed("🛒 Market rolü ayarlandı.")], ephemeral: true });
    return true;
}

// ======================================================
// BAŞVURU SİSTEMİ
// ======================================================

function applicationEmbed() {
    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("📝 Başvuru")
        .setDescription("Başvuru yapmak için aşağıdaki butona tıkla.");
}

function applicationButton() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("application_start").setLabel("Başvuru Yap").setEmoji("📝").setStyle(ButtonStyle.Primary)
    );
}

async function applicationStart(interaction) {
    const config = getGuildConfig(interaction.guild.id);
    const questions = config.application.questions.slice(0, 10);

    if (!questions.length) {
        await interaction.reply({ content: "❌ Başvuru soruları ayarlanmamış.", ephemeral: true });
        return true;
    }

    const first = questions.slice(0, 5);
    const modal = new ModalBuilder().setCustomId(`application_first_${interaction.guild.id}`).setTitle("Başvuru 1/2");

    first.forEach((question, index) => {
        const input = new TextInputBuilder()
            .setCustomId(`answer_${index}`)
            .setLabel(question.slice(0, 45))
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
    });

    await interaction.showModal(modal);
    return true;
}

async function applicationFirstModal(interaction) {
    if (!interaction.isModalSubmit() || !interaction.customId.startsWith("application_first_")) return false;

    const guildId = interaction.customId.replace("application_first_", "");
    const config = getGuildConfig(guildId);
    const answers = [];

    for (let i = 0; i < 5; i++) {
        try { answers.push(interaction.fields.getTextInputValue(`answer_${i}`)); } catch { answers.push(""); }
    }

    const remaining = config.application.questions.slice(5, 10);

    if (!remaining.length) {
        await submitApplication(interaction, guildId, answers);
        return true;
    }

    db.applications[interaction.user.id] = { guildId, answers };
    saveDB();

    const modal = new ModalBuilder().setCustomId(`application_second_${guildId}`).setTitle("Başvuru 2/2");
    // ======================================================
// MESAJ FİLTRELERİ & AUTO REPLY
// ======================================================

const badWords = ["küfür1", "küfür2", "küfür3"];

function autoReply(message) {
    if (!message.guild || message.author.bot) return;

    const config = getGuildConfig(message.guild.id);
    if (!config.moderation.autoReply) return;

    const text = message.content.trim().toLowerCase();
    if (text === "sa") {
        message.channel.send("Aleyküm selam 👋").catch(() => {});
    }
}

function linkFilter(message) {
    if (!message.guild || message.author.bot) return false;

    const config = getGuildConfig(message.guild.id);
    if (!config.moderation.linkFilter) return false;

    if (message.member?.permissions.has(PermissionsBitField.Flags.ManageMessages) || message.author.id === OWNER_ID) return false;

    const hasLink = /(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)/i.test(message.content);
    if (!hasLink) return false;

    message.delete().catch(() => {});
    return true;
}

function badWordFilter(message) {
    if (!message.guild || message.author.bot) return false;

    const config = getGuildConfig(message.guild.id);
    if (!config.moderation.badWordFilter) return false;

    if (message.member?.permissions.has(PermissionsBitField.Flags.ManageMessages) || message.author.id === OWNER_ID) return false;

    const text = message.content.toLowerCase();
    const found = badWords.some(word => text.includes(word));

    if (!found) return false;

    message.delete().catch(() => {});
    return true;
}

// ======================================================
// PREFIX ROUTER
// ======================================================

async function prefixRouter(message) {
    if (!message.content.startsWith(PREFIX)) return;

    const raw = message.content.slice(PREFIX.length).trim();
    if (!raw) return;

    const parts = raw.split(/\s+/);
    const command = parts.shift().toLowerCase();
    const args = parts;

    switch (command) {
        case "ban":
            return banCommand(message, args);
        case "kick":
            return kickCommand(message, args);
        case "mute":
            return muteCommand(message, args);
        case "süreliban":
        case "sureliban":
            return temporaryBanCommand(message, args);
        case "sürelirol":
        case "surelirol":
            return temporaryRoleCommand(message, args);
        case "banlist":
            return banListCommand(message);
        case "kicklist":
            return kickListCommand(message);
        case "fakemesaj":
        case "fake":
            return fakeMessageCommand(message, args);
        case "avatar":
            return avatarCommand(message);
        case "bakiye":
        case "para":
            return balanceCommand(message);
        case "daily":
            return dailyCommand(message);
        case "paraver":
            return giveMoneyCommand(message, args);
        case "market":
            return marketCommand(message);
        case "rastgele":
            return randomRoleCommand(message);
        case "tkm":
            return tkmCommand(message);
        case "panel":
            if (!hasAdministrator(message.member)) {
                await message.reply("❌ Yönetici yetkisi gerekli.");
                return;
            }
            await message.channel.send({
                embeds: [ticketPanelEmbed()],
                components: ticketButtons(message.guild)
            });
            return;
        default:
            return;
    }
}

// ======================================================
// MESSAGE EVENT
// ======================================================

client.on("messageCreate", async message => {
    try {
        if (!message.guild || message.author.bot) return;

        rewardMessage(message);
        autoReply(message);

        if (linkFilter(message)) return;
        if (badWordFilter(message)) return;

        await prefixRouter(message);
    } catch (error) {
        console.error("Mesaj sistemi hatası:", error);
    }
});

// ======================================================
// MEMBER JOIN & LEAVE
// ======================================================

client.on("guildMemberAdd", async member => {
    try {
        const config = getGuildConfig(member.guild.id);
        if (!config.settings.welcomeEnabled || !config.moderation.welcomeChannel) return;

        const channel = member.guild.channels.cache.get(config.moderation.welcomeChannel);
        if (!channel || !channel.isTextBased()) return;

        await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x57F287)
                    .setTitle("👋 Hoş Geldin!")
                    .setDescription(`${member} sunucuya katıldı.`)
                    .setThumbnail(member.displayAvatarURL({ size: 256 }))
            ]
        });
    } catch (error) {
        console.error("Giriş sistemi:", error);
    }
});

client.on("guildMemberRemove", async member => {
    try {
        const config = getGuildConfig(member.guild.id);
        if (!config.settings.leaveEnabled || !config.moderation.leaveChannel) return;

        const channel = member.guild.channels.cache.get(config.moderation.leaveChannel);
        if (!channel || !channel.isTextBased()) return;

        await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle("🚪 Görüşürüz!")
                    .setDescription(`${member.user.tag} sunucudan ayrıldı.`)
            ]
        });
    } catch (error) {
        console.error("Çıkış sistemi:", error);
    }
});

// ======================================================
// SLASH INTERACTION
// ======================================================

async function slashHandler(interaction) {
    if (!interaction.isChatInputCommand()) return false;

    if (interaction.commandName === "moderasyon") {
        if (!isAdmin(interaction.member)) {
            await interaction.reply({ content: "❌ Yönetici yetkisi gerekli.", ephemeral: true });
            return true;
        }

        await interaction.reply({ embeds: [moderationEmbed()], components: moderationButtons(), ephemeral: true });
        return true;
    }

    if (interaction.commandName === "panel") {
        if (!isAdmin(interaction.member)) {
            await interaction.reply({ content: "❌ Yönetici yetkisi gerekli.", ephemeral: true });
            return true;
        }

        await interaction.channel.send({ embeds: [ticketPanelEmbed()], components: ticketButtons(interaction.guild) });
        await interaction.reply({ content: "✅ Ticket paneli gönderildi.", ephemeral: true });
        return true;
    }

    if (interaction.commandName === "basvuru") {
        if (!isAdmin(interaction.member)) {
            await interaction.reply({ content: "❌ Yönetici yetkisi gerekli.", ephemeral: true });
            return true;
        }

        const config = getGuildConfig(interaction.guild.id);
        config.application.enabled = true;
        config.application.channelId = interaction.channel.id;
        saveDB();

        await interaction.channel.send({ embeds: [applicationEmbed()], components: [applicationButton()] });
        await interaction.reply({ content: "✅ Başvuru paneli gönderildi.", ephemeral: true });
        return true;
    }

    if (interaction.commandName === "duyuru") {
        if (!isAdmin(interaction.member)) {
            await interaction.reply({ content: "❌ Yönetici yetkisi gerekli.", ephemeral: true });
            return true;
        }

        const text = interaction.options.getString("mesaj");
        const config = getGuildConfig(interaction.guild.id);
        const channel = config.moderation.announcementChannel ? interaction.guild.channels.cache.get(config.moderation.announcementChannel) : interaction.channel;

        if (!channel || !channel.isTextBased()) {
            await interaction.reply({ content: "❌ Duyuru kanalı bulunamadı.", ephemeral: true });
            return true;
        }

        await channel.send({
            embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle("📢 Duyuru").setDescription(text).setTimestamp()]
        });

        await interaction.reply({ content: "✅ Duyuru gönderildi.", ephemeral: true });
        return true;
    }

    return true;
}

// ======================================================
// MAIN INTERACTION ROUTER
// ======================================================

client.on("interactionCreate", async interaction => {
    try {
        if (await slashHandler(interaction)) return;
        if (await handleTicket(interaction)) return;
        if (await handleTKM(interaction)) return;

        // Başvuru İşlemleri
        if (interaction.isButton() && interaction.customId === "application_start") {
            await applicationStart(interaction);
            return;
        }
        if (await applicationFirstModal(interaction)) return;
        if (await applicationSecondModal(interaction)) return;
        if (await applicationDecision(interaction)) return;

        // Moderasyon İşlemleri
        if (await handleModeration(interaction)) return;
        if (await handleMarketModal(interaction)) return;

        // Market Satın Alım Menüsü
        if (interaction.isStringSelectMenu() && interaction.customId === "market_buy") {
            const selectedIndex = Number(interaction.values[0]);
            await buyMarket(interaction, selectedIndex);
            return;
        }

    } catch (error) {
        console.error("❌ Interaction hatası:", error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "❌ İşlem sırasında bir hata oluştu.", ephemeral: true }).catch(() => {});
        }
    }
});

// ======================================================
// BOTU BAŞLAT
// ======================================================

client.login(TOKEN)
    .then(() => {
        console.log("🚀 Discord botu başlatılıyor...");
    })
    .catch(error => {
        console.error("❌ Discord giriş hatası:", error);
        process.exit(1);
    });
