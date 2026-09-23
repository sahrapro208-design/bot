// ======================================================
// DISCORD COMMUNITY BOT - RAILWAY
// ======================================================

const {
    Client,
    GatewayIntentBits,
    Partials,
    PermissionsBitField,
    ChannelType,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    RoleSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    AttachmentBuilder,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ======================================================
// CONFIG
// ======================================================

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
    console.error("DISCORD_TOKEN bulunamadı!");
    process.exit(1);
}

const DATA_FILE = path.join(__dirname, "database.json");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User,
        Partials.GuildMember
    ]
});

// ======================================================
// MEMORY
// ======================================================

const setupSessions = new Map();
const applicationSetupSessions = new Map();
const giveawaySessions = new Map();
const dropSessions = new Map();
const clanVoteSessions = new Map();

// ======================================================
// DATABASE
// ======================================================

function loadDatabase() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
            return {};
        }

        const raw = fs.readFileSync(DATA_FILE, "utf8");

        if (!raw.trim()) {
            return {};
        }

        return JSON.parse(raw);
    } catch (error) {
        console.error("Database yüklenemedi:", error);
        return {};
    }
}

const database = loadDatabase();

function saveDatabase() {
    try {
        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(database, null, 2)
        );
    } catch (error) {
        console.error("Database kaydedilemedi:", error);
    }
}

function getGuildData(guildId) {
    if (!database[guildId]) {
        database[guildId] = {
            ticket: {
                staffRoleId: null,
                categoryId: null,
                buttonNames: [
                    "Genel Destek",
                    "Teknik Destek",
                    "Yetkili Başvurusu",
                    "Satın Alma",
                    "Şikayet",
                    "Diğer"
                ]
            },

            moderation: {
                autoRoleId: null,
                autoReplies: {},
                badWords: [],
                linkChannels: [],
                announcementChannels: [],
                announcementChannel: null,
                chatChannel: null,
                logChannel: null,
                welcomeChannel: null,
                leaveChannel: null,
                suggestionChannel: null
            },

            application: {
                roleId: null,
                questions: []
            },

            statistics: {
                totalMessages: 0
            },

            clans: []
        };

        saveDatabase();
    }

    const data = database[guildId];

    if (!data.ticket) {
        data.ticket = {
            staffRoleId: null,
            categoryId: null,
            buttonNames: [
                "Genel Destek",
                "Teknik Destek",
                "Yetkili Başvurusu",
                "Satın Alma",
                "Şikayet",
                "Diğer"
            ]
        };
    }

    if (!Array.isArray(data.ticket.buttonNames)) {
        data.ticket.buttonNames = [
            "Genel Destek",
            "Teknik Destek",
            "Yetkili Başvurusu",
            "Satın Alma",
            "Şikayet",
            "Diğer"
        ];
    }

    while (data.ticket.buttonNames.length < 6) {
        data.ticket.buttonNames.push(
            `Kategori ${data.ticket.buttonNames.length + 1}`
        );
    }

    data.ticket.buttonNames =
        data.ticket.buttonNames.slice(0, 6);

    if (!data.moderation) {
        data.moderation = {
            autoRoleId: null,
            autoReplies: {},
            badWords: [],
            linkChannels: [],
            announcementChannels: [],
            announcementChannel: null,
            chatChannel: null,
            logChannel: null,
            welcomeChannel: null,
            leaveChannel: null,
            suggestionChannel: null
        };
    }

    if (!data.application) {
        data.application = {
            roleId: null,
            questions: []
        };
    }

    if (!data.statistics) {
        data.statistics = {
            totalMessages: 0
        };
    }

    if (!Array.isArray(data.clans)) {
        data.clans = [];
    }

    return data;
}

// ======================================================
// HELPERS
// ======================================================

function normalizeText(text) {
    return String(text || "")
        .toLocaleLowerCase("tr-TR")
        .trim();
}

function parseDuration(input) {
    const match = String(input || "")
        .trim()
        .toLowerCase()
        .match(/^(\d+)\s*(s|m|h|d|w)$/);

    if (!match) {
        return null;
    }

    const value = Number(match[1]);
    const unit = match[2];

    const multipliers = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000
    };

    return value * multipliers[unit];
}

function isAdministrator(member) {
    return member.permissions.has(
        PermissionsBitField.Flags.Administrator
    );
}

function isTicketStaff(member, guildData) {
    if (!member || !guildData.ticket.staffRoleId) {
        return false;
    }

    return member.roles.cache.has(
        guildData.ticket.staffRoleId
    );
}

function getTicketStaffRole(guild, guildData) {
    if (!guildData.ticket.staffRoleId) {
        return null;
    }

    return guild.roles.cache.get(
        guildData.ticket.staffRoleId
    ) || null;
}

async function safeReply(interaction, content, options = {}) {
    try {
        if (interaction.deferred || interaction.replied) {
            return await interaction.editReply({
                content,
                ...options
            });
        }

        return await interaction.reply({
            content,
            ...options
        });
    } catch (error) {
        console.error("safeReply:", error);
    }
}

async function sendLog(guild, title, description) {
    const data = getGuildData(guild.id);

    if (!data.moderation.logChannel) {
        return;
    }

    const channel = guild.channels.cache.get(
        data.moderation.logChannel
    );

    if (!channel) {
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();

    await channel.send({
        embeds: [embed]
    }).catch(() => {});
}

// ======================================================
// COMMANDS
// ======================================================

const commands = [
    new SlashCommandBuilder()
        .setName("panel")
        .setDescription("Ticket panelini kurar."),

    new SlashCommandBuilder()
        .setName("moderasyon")
        .setDescription("Moderasyon ayarlarını açar."),

    new SlashCommandBuilder()
        .setName("cekilis")
        .setDescription("Çekiliş başlatır.")
        .addStringOption(option =>
            option
                .setName("sure")
                .setDescription("Örn: 10m, 1h, 1d")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName("kazanan")
                .setDescription("Kazanan sayısı")
                .setMinValue(1)
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("odul")
                .setDescription("Çekiliş ödülü")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("drop")
        .setDescription("Drop başlatır.")
        .addStringOption(option =>
            option
                .setName("odul")
                .setDescription("Drop ödülü")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("duyuru")
        .setDescription("Duyuru gönderir.")
        .addStringOption(option =>
            option
                .setName("mesaj")
                .setDescription("Duyuru mesajı")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("basvuru")
        .setDescription("Başvuru sistemini kurar."),

    new SlashCommandBuilder()
        .setName("klanekle")
        .setDescription("Klan ekler.")
        .addStringOption(option =>
            option
                .setName("klan")
                .setDescription("Klan adı")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("klandel")
        .setDescription("Klan siler.")
        .addStringOption(option =>
            option
                .setName("klan")
                .setDescription("Silinecek klan")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("klanoyla")
        .setDescription("Klan oylamasını açar."),

    new SlashCommandBuilder()
        .setName("klanbitir")
        .setDescription("Klan oylamasını bitirir."),

    new SlashCommandBuilder()
        .setName("yardim")
        .setDescription("Bot yardım menüsünü gösterir.")
].map(command => command.toJSON());

// ======================================================
// READY
// ======================================================

client.once("ready", async () => {
    console.log(`Bot giriş yaptı: ${client.user.tag}`);

    try {
        const rest = new REST({
            version: "10"
        }).setToken(TOKEN);

        await rest.put(
            Routes.applicationCommands(client.user.id),
            {
                body: commands
            }
        );

        console.log("Slash komutları yüklendi.");
    } catch (error) {
        console.error("Slash komutları yüklenemedi:", error);
    }

    client.user.setPresence({
        activities: [
            {
                name: "Topluluğu yönetiyor",
                type: 3
            }
        ],
        status: "online"
    });
});

// ======================================================
// TICKET PANEL
// ======================================================

function createTicketPanel(guildData) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId("ticket_open_menu")
        .setPlaceholder("Destek kategorisini seç")
        .addOptions(
            guildData.ticket.buttonNames.map((name, index) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(name.slice(0, 100))
                    .setValue(`ticket_${index}`)
                    .setDescription(
                        "Bu kategoride destek talebi oluştur."
                    )
            )
        );

    return new ActionRowBuilder().addComponents(menu);
}

function createTicketButtons() {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("ticket_claim")
                .setLabel("Üstlen")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId("ticket_help")
                .setLabel("Yardım")
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId("ticket_close")
                .setLabel("Kapat")
                .setStyle(ButtonStyle.Danger)
        )
    ];
}

// ======================================================
// MODERATION PANEL
// ======================================================

function createModerationPanel() {
    const menu = new StringSelectMenuBuilder()
        .setCustomId("moderation_menu")
        .setPlaceholder("Bir moderasyon ayarı seç")
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel("Otomatik Rol")
                .setValue("auto_role"),

            new StringSelectMenuOptionBuilder()
                .setLabel("Otomatik Cevap")
                .setValue("auto_reply"),

            new StringSelectMenuOptionBuilder()
                .setLabel("Küfür Filtresi")
                .setValue("bad_words"),

            new StringSelectMenuOptionBuilder()
                .setLabel("Link Engelleme")
                .setValue("link_channels"),

            new StringSelectMenuOptionBuilder()
                .setLabel("Duyuru Kanalları")
                .setValue("announcement_channels"),

            new StringSelectMenuOptionBuilder()
                .setLabel("Log Kanalı")
                .setValue("log_channel"),

            new StringSelectMenuOptionBuilder()
                .setLabel("Hoş Geldin")
                .setValue("welcome_channel"),

            new StringSelectMenuOptionBuilder()
                .setLabel("Güle Güle")
                .setValue("leave_channel"),

            new StringSelectMenuOptionBuilder()
                .setLabel("Öneri Kanalı")
                .setValue("suggestion_channel")
        );

    return new ActionRowBuilder().addComponents(menu);
}

// ======================================================
// APPLICATION PANEL
// ======================================================

function createApplicationPanel() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("application_start")
            .setLabel("Başvuru Yap")
            .setStyle(ButtonStyle.Primary)
    );
}

// ======================================================
// GUILD COMMANDS
// ======================================================

async function handleChatInput(interaction) {
    const command = interaction.commandName;
    const guildData = getGuildData(interaction.guild.id);

    // --------------------------------------------------
    // PANEL
    // --------------------------------------------------

    if (command === "panel") {
        if (!isAdministrator(interaction.member)) {
            return safeReply(
                interaction,
                "Bu komutu kullanmak için yönetici olmalısın.",
                { ephemeral: true }
            );
        }

        setupSessions.set(interaction.user.id, {
            guildId: interaction.guild.id,
            step: "staff"
        });

        const row = new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
                .setCustomId("ticket_staff_role")
                .setPlaceholder("Ticket yetkili rolünü seç")
                .setMinValues(1)
                .setMaxValues(1)
        );

        return interaction.reply({
            content: "Önce ticket yetkili rolünü seç.",
            components: [row],
            ephemeral: true
        });
    }

    // --------------------------------------------------
    // MODERATION
    // --------------------------------------------------

    if (command === "moderasyon") {
        if (!isAdministrator(interaction.member)) {
            return safeReply(
                interaction,
                "Bu komutu kullanmak için yönetici olmalısın.",
                { ephemeral: true }
            );
        }

        return interaction.reply({
            content: "Moderasyon ayarlarından birini seç.",
            components: [createModerationPanel()],
            ephemeral: true
        });
    }

    // --------------------------------------------------
    // GIVEAWAY
    // --------------------------------------------------

    if (command === "cekilis") {
        if (!isAdministrator(interaction.member)) {
            return safeReply(
                interaction,
                "Bu komutu kullanmak için yönetici olmalısın.",
                { ephemeral: true }
            );
        }

        const duration = parseDuration(
            interaction.options.getString("sure")
        );

        const winners = interaction.options.getInteger("kazanan");
        const prize = interaction.options.getString("odul");

        if (!duration) {
            return safeReply(
                interaction,
                "Geçersiz süre. Örnek: `10m`, `1h`, `1d`.",
                { ephemeral: true }
            );
        }

        if (duration < 1000) {
            return safeReply(
                interaction,
                "Süre çok kısa.",
                { ephemeral: true }
            );
        }

        const endAt = Date.now() + duration;

        const embed = new EmbedBuilder()
            .setTitle("🎉 ÇEKİLİŞ")
            .setDescription(
                [
                    `🎁 **Ödül:** ${prize}`,
                    `🏆 **Kazanan:** ${winners}`,
                    `⏰ **Bitiş:** <t:${Math.floor(endAt / 1000)}:R>`,
                    "",
                    "Katılmak için aşağıdaki butona bas."
                ].join("\n")
            )
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`giveaway_join:${Date.now()}`)
                .setLabel("Katıl")
                .setStyle(ButtonStyle.Success)
        );

        const message = await interaction.reply({
            embeds: [embed],
            components: [row],
            fetchReply: true
        });

        const giveawayId = message.id;

        giveawaySessions.set(giveawayId, {
            guildId: interaction.guild.id,
            channelId: interaction.channel.id,
            messageId: message.id,
            prize,
            winners,
            endAt,
            participants: new Set()
        });

        setTimeout(
            () => finishGiveaway(giveawayId),
            duration
        );

        return;
    }

    // --------------------------------------------------
    // DROP
    // --------------------------------------------------

    if (command === "drop") {
        if (!isAdministrator(interaction.member)) {
            return safeReply(
                interaction,
                "Bu komutu kullanmak için yönetici olmalısın.",
                { ephemeral: true }
            );
        }

        const prize = interaction.options.getString("odul");

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`drop_claim:${Date.now()}`)
                .setLabel("İlk Ben!")
                .setStyle(ButtonStyle.Success)
        );

        const embed = new EmbedBuilder()
            .setTitle("🎁 DROP")
            .setDescription(
                `Ödül: **${prize}**\n\nİlk butona basan kişi ödülü kazanır!`
            )
            .setTimestamp();

        const message = await interaction.reply({
            embeds: [embed],
            components: [row],
            fetchReply: true
        });

        dropSessions.set(message.id, {
            guildId: interaction.guild.id,
            channelId: interaction.channel.id,
            messageId: message.id,
            prize
        });

        return;
    }

    // --------------------------------------------------
    // ANNOUNCEMENT
    // --------------------------------------------------

    if (command === "duyuru") {
        if (!isAdministrator(interaction.member)) {
            return safeReply(
                interaction,
                "Bu komutu kullanmak için yönetici olmalısın.",
                { ephemeral: true }
            );
        }

        const text = interaction.options.getString("mesaj");

        const announcementChannel =
            guildData.moderation.announcementChannel
                ? interaction.guild.channels.cache.get(
                    guildData.moderation.announcementChannel
                )
                : null;

        const chatChannel =
            guildData.moderation.chatChannel
                ? interaction.guild.channels.cache.get(
                    guildData.moderation.chatChannel
                )
                : null;

        if (!announcementChannel && !chatChannel) {
            return safeReply(
                interaction,
                "Önce duyuru kanallarını moderasyon panelinden ayarlamalısın.",
                { ephemeral: true }
            );
        }

        if (announcementChannel) {
            await announcementChannel.send({
                content: `@everyone\n${text}`,
                allowedMentions: {
                    parse: ["everyone"]
                }
            }).catch(() => {});
        }

        if (
            chatChannel &&
            chatChannel.id !== announcementChannel?.id
        ) {
            await chatChannel.send(text).catch(() => {});
        }

        return safeReply(
            interaction,
            "Duyuru gönderildi.",
            { ephemeral: true }
        );
    }

    // --------------------------------------------------
    // APPLICATION
    // --------------------------------------------------

    if (command === "basvuru") {
        if (!isAdministrator(interaction.member)) {
            return safeReply(
                interaction,
                "Bu komutu kullanmak için yönetici olmalısın.",
                { ephemeral: true }
            );
        }

        applicationSetupSessions.set(
            interaction.user.id,
            {
                guildId: interaction.guild.id
            }
        );

        const modal = new ModalBuilder()
            .setCustomId("application_question_count")
            .setTitle("Başvuru Kurulumu");

        const input = new TextInputBuilder()
            .setCustomId("count")
            .setLabel("Kaç soru olsun? (1-5)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(1);

        modal.addComponents(
            new ActionRowBuilder().addComponents(input)
        );

        return interaction.showModal(modal);
    }

    // --------------------------------------------------
    // CLAN ADD
    // --------------------------------------------------

    if (command === "klanekle") {
        if (!isAdministrator(interaction.member)) {
            return safeReply(
                interaction,
                "Bu komutu kullanmak için yönetici olmalısın.",
                { ephemeral: true }
            );
        }

        const clan = interaction.options.getString("klan").trim();

        if (!clan) {
            return safeReply(
                interaction,
                "Klan adı boş olamaz.",
                { ephemeral: true }
            );
        }

        if (guildData.clans.some(
            x => normalizeText(x) === normalizeText(clan)
        )) {
            return safeReply(
                interaction,
                "Bu klan zaten eklenmiş.",
                { ephemeral: true }
            );
        }

        guildData.clans.push(clan);
        saveDatabase();

        return safeReply(
            interaction,
            `**${clan}** klanı eklendi.`,
            { ephemeral: true }
        );
    }

    // --------------------------------------------------
    // CLAN DELETE
    // --------------------------------------------------

    if (command === "klandel") {
        if (!isAdministrator(interaction.member)) {
            return safeReply(
                interaction,
                "Bu komutu kullanmak için yönetici olmalısın.",
                { ephemeral: true }
            );
        }

        const clan = interaction.options.getString("klan");

        const index = guildData.clans.findIndex(
            x => normalizeText(x) === normalizeText(clan)
        );

        if (index === -1) {
            return safeReply(
                interaction,
                "Bu klan bulunamadı.",
                { ephemeral: true }
            );
        }

        const removed = guildData.clans.splice(index, 1)[0];
        saveDatabase();

        return safeReply(
            interaction,
            `**${removed}** klanı silindi.`,
            { ephemeral: true }
        );
    }

    // --------------------------------------------------
    // CLAN VOTE
    // --------------------------------------------------

    if (command === "klanoyla") {
        if (!isAdministrator(interaction.member)) {
            return safeReply(
                interaction,
                "Bu komutu kullanmak için yönetici olmalısın.",
                { ephemeral: true }
            );
        }

        return startClanVote(interaction);
    }

    // --------------------------------------------------
    // CLAN END
    // --------------------------------------------------

    if (command === "klanbitir") {
        if (!isAdministrator(interaction.member)) {
            return safeReply(
                interaction,
                "Bu komutu kullanmak için yönetici olmalısın.",
                { ephemeral: true }
            );
        }

        return finishClanVote(interaction);
    }

    // --------------------------------------------------
    // HELP
    // --------------------------------------------------

    if (command === "yardim") {
        const embed = new EmbedBuilder()
            .setTitle("🤖 Bot Yardım")
            .setDescription(
                [
                    "`/panel` — Ticket sistemi",
                    "`/moderasyon` — Moderasyon sistemi",
                    "`/cekilis` — Çekiliş",
                    "`/drop` — Drop",
                    "`/duyuru` — Duyuru",
                    "`/basvuru` — Başvuru",
                    "`/klanekle` — Klan ekle",
                    "`/klandel` — Klan sil",
                    "`/klanoyla` — Klan oylaması",
                    "`/klanbitir` — Oylamayı bitir",
                    "`k!lock` — Kanalı kilitle",
                    "`k!unlock` — Kanalı aç",
                    "`k!sıfırla` — Kanalı temizle",
                    "`!serverinfo` — Sunucu bilgileri"
                ].join("\n")
            );

        return interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }
}
// ======================================================
// TICKET SETUP
// ======================================================

async function handleRoleSelect(interaction) {
    const customId = interaction.customId;

    // --------------------------------------------------
    // TICKET STAFF ROLE
    // --------------------------------------------------

    if (customId === "ticket_staff_role") {
        if (!isAdministrator(interaction.member)) {
            return safeReply(
                interaction,
                "Bu işlemi yapamazsın.",
                { ephemeral: true }
            );
        }

        const roleId = interaction.values[0];

        const session = setupSessions.get(
            interaction.user.id
        );

        if (!session) {
            return safeReply(
                interaction,
                "Kurulum oturumun bulunamadı. `/panel` komutunu tekrar kullan.",
                { ephemeral: true }
            );
        }

        session.staffRoleId = roleId;
        session.step = "category";

        const row = new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId("ticket_category")
                .setPlaceholder("Ticket kategorisini seç")
                .addChannelTypes(ChannelType.GuildCategory)
                .setMinValues(1)
                .setMaxValues(1)
        );

        return interaction.update({
            content: "Şimdi ticket kategorisini seç.",
            components: [row]
        });
    }

    // --------------------------------------------------
    // MODERATION AUTO ROLE
    // --------------------------------------------------

    if (customId === "moderation_auto_role") {
        if (!isAdministrator(interaction.member)) {
            return safeReply(
                interaction,
                "Bu işlemi yapamazsın.",
                { ephemeral: true }
            );
        }

        const roleId = interaction.values[0];

        const guildData = getGuildData(
            interaction.guild.id
        );

        guildData.moderation.autoRoleId = roleId;
        saveDatabase();

        return interaction.update({
            content: "Otomatik rol başarıyla ayarlandı.",
            components: []
        });
    }

    // --------------------------------------------------
    // APPLICATION ROLE
    // --------------------------------------------------

    if (customId === "application_role") {
        if (!isAdministrator(interaction.member)) {
            return safeReply(
                interaction,
                "Bu işlemi yapamazsın.",
                { ephemeral: true }
            );
        }

        const roleId = interaction.values[0];

        const guildData = getGuildData(
            interaction.guild.id
        );

        guildData.application.roleId = roleId;
        saveDatabase();

        applicationSetupSessions.set(
            interaction.user.id,
            {
                guildId: interaction.guild.id,
                questions: guildData.application.questions,
                roleId
            }
        );

        const panel = new EmbedBuilder()
            .setTitle("📋 Başvuru Sistemi")
            .setDescription(
                "Başvuru yapmak için aşağıdaki butona bas."
            );

        await interaction.update({
            content: "Başvuru sistemi hazırlandı.",
            components: []
        });

        return interaction.channel.send({
            embeds: [panel],
            components: [createApplicationPanel()]
        });
    }
}

// ======================================================
// CHANNEL SELECT
// ======================================================

async function handleChannelSelect(interaction) {
    const customId = interaction.customId;
    const guildData = getGuildData(
        interaction.guild.id
    );

    // --------------------------------------------------
    // TICKET CATEGORY
    // --------------------------------------------------

    if (customId === "ticket_category") {
        if (!isAdministrator(interaction.member)) {
            return safeReply(
                interaction,
                "Bu işlemi yapamazsın.",
                { ephemeral: true }
            );
        }

        const session = setupSessions.get(
            interaction.user.id
        );

        if (!session) {
            return safeReply(
                interaction,
                "Kurulum oturumun bulunamadı.",
                { ephemeral: true }
            );
        }

        session.categoryId = interaction.values[0];

        const modal = new ModalBuilder()
            .setCustomId("ticket_names_first")
            .setTitle("Ticket Kategorileri 1/2");

        for (let i = 0; i < 3; i++) {
            const input = new TextInputBuilder()
                .setCustomId(`name_${i}`)
                .setLabel(
                    `Ticket ${i + 1} adı`
                )
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(45);

            modal.addComponents(
                new ActionRowBuilder().addComponents(input)
            );
        }

        return interaction.showModal(modal);
    }

    // --------------------------------------------------
    // LINK CHANNELS
    // --------------------------------------------------

    if (customId === "moderation_link_channels") {
        if (!isAdministrator(interaction.member)) {
            return safeReply(
                interaction,
                "Bu işlemi yapamazsın.",
                { ephemeral: true }
            );
        }

        guildData.moderation.linkChannels =
            [...interaction.values];

        saveDatabase();

        return interaction.update({
            content:
                "Link engelleme kanalları başarıyla ayarlandı.",
            components: []
        });
    }

    // --------------------------------------------------
    // ANNOUNCEMENT CHANNELS
    // --------------------------------------------------

    if (customId === "moderation_announcement_channels") {
        if (!isAdministrator(interaction.member)) {
            return safeReply(
                interaction,
                "Bu işlemi yapamazsın.",
                { ephemeral: true }
            );
        }

        guildData.moderation.announcementChannels =
            [...interaction.values];

        guildData.moderation.announcementChannel =
            interaction.values[0] || null;

        guildData.moderation.chatChannel =
            interaction.values[1] || null;

        saveDatabase();

        return interaction.update({
            content:
                "Duyuru ve sohbet kanalları ayarlandı.",
            components: []
        });
    }

    // --------------------------------------------------
    // LOG CHANNEL
    // --------------------------------------------------

    if (customId === "moderation_log_channel") {
        guildData.moderation.logChannel =
            interaction.values[0];

        saveDatabase();

        return interaction.update({
            content: "Log kanalı ayarlandı.",
            components: []
        });
    }

    // --------------------------------------------------
    // WELCOME CHANNEL
    // --------------------------------------------------

    if (customId === "moderation_welcome_channel") {
        guildData.moderation.welcomeChannel =
            interaction.values[0];

        saveDatabase();

        return interaction.update({
            content: "Hoş geldin kanalı ayarlandı.",
            components: []
        });
    }

    // --------------------------------------------------
    // LEAVE CHANNEL
    // --------------------------------------------------

    if (customId === "moderation_leave_channel") {
        guildData.moderation.leaveChannel =
            interaction.values[0];

        saveDatabase();

        return interaction.update({
            content: "Güle güle kanalı ayarlandı.",
            components: []
        });
    }

    // --------------------------------------------------
    // SUGGESTION CHANNEL
    // --------------------------------------------------

    if (customId === "moderation_suggestion_channel") {
        guildData.moderation.suggestionChannel =
            interaction.values[0];

        saveDatabase();

        return interaction.update({
            content: "Öneri kanalı ayarlandı.",
            components: []
        });
    }
}

// ======================================================
// MODERATION MENU
// ======================================================

async function handleModerationMenu(interaction) {
    const value = interaction.values[0];

    if (!isAdministrator(interaction.member)) {
        return safeReply(
            interaction,
            "Bu işlemi yapamazsın.",
            { ephemeral: true }
        );
    }

    if (value === "auto_role") {
        const row = new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
                .setCustomId("moderation_auto_role")
                .setPlaceholder("Otomatik rolü seç")
                .setMinValues(1)
                .setMaxValues(1)
        );

        return interaction.update({
            content: "Yeni üyelerin alacağı rolü seç.",
            components: [row]
        });
    }

    if (value === "auto_reply") {
        const modal = new ModalBuilder()
            .setCustomId("moderation_auto_reply")
            .setTitle("Otomatik Cevap");

        const trigger = new TextInputBuilder()
            .setCustomId("trigger")
            .setLabel("Tetikleyici")
            .setPlaceholder("sa")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100);

        const response = new TextInputBuilder()
            .setCustomId("response")
            .setLabel("Botun cevabı")
            .setPlaceholder("Aleyküm selam!")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000);

        modal.addComponents(
            new ActionRowBuilder().addComponents(trigger),
            new ActionRowBuilder().addComponents(response)
        );

        return interaction.showModal(modal);
    }

    if (value === "bad_words") {
        const modal = new ModalBuilder()
            .setCustomId("moderation_bad_words")
            .setTitle("Küfür Filtresi");

        const input = new TextInputBuilder()
            .setCustomId("words")
            .setLabel("Kelimeleri virgülle ayır")
            .setPlaceholder("kelime1,kelime2,kelime3")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(2000);

        modal.addComponents(
            new ActionRowBuilder().addComponents(input)
        );

        return interaction.showModal(modal);
    }

    if (value === "link_channels") {
        const row = new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId("moderation_link_channels")
                .setPlaceholder("Link engellenecek kanalları seç")
                .addChannelTypes(ChannelType.GuildText)
                .setMinValues(1)
                .setMaxValues(10)
        );

        return interaction.update({
            content: "Link engellemenin aktif olacağı kanalları seç.",
            components: [row]
        });
    }

    if (value === "announcement_channels") {
        const row = new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId("moderation_announcement_channels")
                .setPlaceholder(
                    "Önce duyuru, sonra sohbet kanalını seç"
                )
                .addChannelTypes(ChannelType.GuildText)
                .setMinValues(1)
                .setMaxValues(2)
        );

        return interaction.update({
            content:
                "İlk kanal duyuru, ikinci kanal normal sohbet kanalı olacak.",
            components: [row]
        });
    }

    if (value === "log_channel") {
        const row = new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId("moderation_log_channel")
                .setPlaceholder("Log kanalını seç")
                .addChannelTypes(ChannelType.GuildText)
                .setMinValues(1)
                .setMaxValues(1)
        );

        return interaction.update({
            content: "Log kanalını seç.",
            components: [row]
        });
    }

    if (value === "welcome_channel") {
        const row = new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId("moderation_welcome_channel")
                .setPlaceholder("Hoş geldin kanalını seç")
                .addChannelTypes(ChannelType.GuildText)
                .setMinValues(1)
                .setMaxValues(1)
        );

        return interaction.update({
            content: "Hoş geldin kanalını seç.",
            components: [row]
        });
    }

    if (value === "leave_channel") {
        const row = new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId("moderation_leave_channel")
                .setPlaceholder("Güle güle kanalını seç")
                .addChannelTypes(ChannelType.GuildText)
                .setMinValues(1)
                .setMaxValues(1)
        );

        return interaction.update({
            content: "Güle güle kanalını seç.",
            components: [row]
        });
    }

    if (value === "suggestion_channel") {
        const row = new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId("moderation_suggestion_channel")
                .setPlaceholder("Öneri kanalını seç")
                .addChannelTypes(ChannelType.GuildText)
                .setMinValues(1)
                .setMaxValues(1)
        );

        return interaction.update({
            content: "Öneri kanalını seç.",
            components: [row]
        });
    }
}

// ======================================================
// STRING SELECT
// ======================================================

async function handleStringSelect(interaction) {
    if (interaction.customId === "moderation_menu") {
        return handleModerationMenu(interaction);
    }

    if (interaction.customId === "ticket_open_menu") {
        return handleTicketOpen(interaction);
    }

    if (interaction.customId === "clan_vote_menu") {
        return handleClanMenu(interaction);
    }
}

// ======================================================
// TICKET OPEN
// ======================================================

async function handleTicketOpen(interaction) {
    const guildData = getGuildData(
        interaction.guild.id
    );

    if (!guildData.ticket.staffRoleId ||
        !guildData.ticket.categoryId) {
        return safeReply(
            interaction,
            "Ticket sistemi henüz kurulmamış.",
            { ephemeral: true }
        );
    }

    const existing = interaction.guild.channels.cache.find(
        channel =>
            channel.type === ChannelType.GuildText &&
            channel.topic === `ticket-owner:${interaction.user.id}`
    );

    if (existing) {
        return safeReply(
            interaction,
            `Zaten açık bir ticketın var: ${existing}`,
            { ephemeral: true }
        );
    }

    const selected = interaction.values[0];

    const index = Number(
        selected.replace("ticket_", "")
    );

    const buttonName =
        guildData.ticket.buttonNames[index] ||
        "Destek";

    await interaction.deferReply({
        ephemeral: true
    });

    const staffRole = getTicketStaffRole(
        interaction.guild,
        guildData
    );

    if (!staffRole) {
        return safeReply(
            interaction,
            "Ticket yetkili rolü bulunamadı.",
            { ephemeral: true }
        );
    }

    const channel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`
            .toLowerCase()
            .replace(/[^a-z0-9-_]/g, "")
            .slice(0, 80),
        type: ChannelType.GuildText,
        parent: guildData.ticket.categoryId,
        topic: `ticket-owner:${interaction.user.id}`,
        permissionOverwrites: [
            {
                id: interaction.guild.roles.everyone.id,
                deny: [
                    PermissionsBitField.Flags.ViewChannel
                ]
            },
            {
                id: interaction.user.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory
                ]
            },
            {
                id: staffRole.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory
                ]
            }
        ]
    }).catch(error => {
        console.error("Ticket oluşturma hatası:", error);
        return null;
    });

    if (!channel) {
        return safeReply(
            interaction,
            "Ticket oluşturulamadı. Botun kanal oluşturma yetkisini kontrol et.",
            { ephemeral: true }
        );
    }

    const embed = new EmbedBuilder()
        .setTitle(`🎫 ${buttonName}`)
        .setDescription(
            [
                `Ticket sahibi: ${interaction.user}`,
                "",
                "Yetkili ekibi ticket ile ilgilenecektir.",
                "",
                "🔵 **Üstlen:** Ticketı bir yetkili üstlenir.",
                "🟡 **Yardım:** Üstlenen yetkili isterse diğer yetkililerin yazmasını açabilir.",
                "🔴 **Kapat:** Sadece yetkililer ticketı kapatabilir."
            ].join("\n")
        )
        .setTimestamp();

    await channel.send({
        content: `${interaction.user} ${staffRole}`,
        embeds: [embed],
        components: createTicketButtons()
    });

    await safeReply(
        interaction,
        `Ticket oluşturuldu: ${channel}`,
        { ephemeral: true }
    );
}

// ======================================================
// TICKET BUTTONS
// ======================================================

async function handleTicketButton(interaction) {
    const guildData = getGuildData(
        interaction.guild.id
    );

    const isStaff =
        isTicketStaff(interaction.member, guildData);

    if (!isStaff) {
        return safeReply(
            interaction,
            "Bu işlemi sadece ticket yetkilileri kullanabilir.",
            { ephemeral: true }
        );
    }

    if (interaction.customId === "ticket_claim") {
        const topic = interaction.channel.topic || "";

        if (topic.includes("claimed:")) {
            return safeReply(
                interaction,
                "Bu ticket zaten başka bir yetkili tarafından üstlenildi.",
                { ephemeral: true }
            );
        }

        await interaction.deferUpdate();

        await interaction.channel.setTopic(
            `${topic}|claimed:${interaction.user.id}`
        );

        const staffRole = getTicketStaffRole(
            interaction.guild,
            guildData
        );

        if (staffRole) {
            await interaction.channel.permissionOverwrites.edit(
                staffRole.id,
                {
                    SendMessages: false
                }
            ).catch(() => {});
        }

        await interaction.channel.permissionOverwrites.edit(
            interaction.user.id,
            {
                ViewChannel: true,
                SendMessages: true,
     ReadMessageHistory: true
            }
        ).catch(() => {});

        await interaction.channel.send(
            `🔵 ${interaction.user} ticketı üstlendi.`
        );

        return;
    }

    if (interaction.customId === "ticket_help") {
        const topic = interaction.channel.topic || "";

        const match = topic.match(
            /claimed:(\d+)/
        );

        if (!match) {
            return safeReply(
                interaction,
                "Bu ticket henüz üstlenilmedi.",
                { ephemeral: true }
            );
        }

        await interaction.deferUpdate();

        const staffRole = getTicketStaffRole(
            interaction.guild,
            guildData
        );

        if (staffRole) {
            await interaction.channel.permissionOverwrites.edit(
                staffRole.id,
                {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                }
            ).catch(() => {});
        }

        await interaction.channel.send(
            `🟡 ${interaction.user} yardım istedi. Diğer yetkililerin yazması tekrar açıldı.`
        );

        return;
    }

    if (interaction.customId === "ticket_close") {
        await interaction.deferUpdate();

        await closeTicket(interaction);
    }
}

// ======================================================
// TICKET CLOSE
// ======================================================

async function closeTicket(interaction) {
    const channel = interaction.channel;

    const topic = channel.topic || "";

    const ownerMatch = topic.match(
        /ticket-owner:(\d+)/
    );

    const ownerId =
        ownerMatch ? ownerMatch[1] : null;

    let messages = [];

    try {
        const fetched = await channel.messages.fetch({
            limit: 100
        });

        messages = [...fetched.values()]
            .reverse();
    } catch (error) {
        console.error("Transcript fetch hatası:", error);
    }

    const transcript = messages.map(message => {
        const date = new Date(
            message.createdTimestamp
        ).toISOString();

        const content =
            message.content || "[Embed / Dosya / İçerik]";

        return `[${date}] ${message.author.tag}: ${content}`;
    }).join("\n");

    const attachment = new AttachmentBuilder(
        Buffer.from(
            transcript || "Ticket transcript boş.",
            "utf8"
        ),
        {
            name: `${channel.name}-transcript.txt`
        }
    );

    if (ownerId) {
        const owner = await client.users.fetch(
            ownerId
        ).catch(() => null);

        if (owner) {
            await owner.send({
                content:
                    `🎫 **${channel.name}** ticket transcripti:`,
                files: [attachment]
            }).catch(() => {});
        }
    }

    const staffRole = getTicketStaffRole(
        interaction.guild,
        getGuildData(interaction.guild.id)
    );

    if (staffRole) {
        for (const member of staffRole.members.values()) {
            await member.send({
                content:
                    `🎫 **${channel.name}** ticket transcripti:`,
                files: [attachment]
            }).catch(() => {});
        }
    }

    await sendLog(
        interaction.guild,
        "🎫 Ticket Kapatıldı",
        `Kapatılan ticket: ${channel.name}\nKapatılan kişi: ${interaction.user}`
    );

    await channel.delete(
        "Ticket kapatıldı."
    ).catch(() => {});
}
// ======================================================
// MODAL HANDLER
// ======================================================

async function handleModalSubmit(interaction) {
    const customId = interaction.customId;

    // --------------------------------------------------
    // TICKET NAMES FIRST
    // --------------------------------------------------

    if (customId === "ticket_names_first") {
        const session = setupSessions.get(
            interaction.user.id
        );

        if (!session) {
            return safeReply(
                interaction,
                "Kurulum oturumun bulunamadı.",
                { ephemeral: true }
            );
        }

        session.buttonNames = [
            interaction.fields.getTextInputValue("name_0"),
            interaction.fields.getTextInputValue("name_1"),
            interaction.fields.getTextInputValue("name_2")
        ];

        const modal = new ModalBuilder()
            .setCustomId("ticket_names_second")
            .setTitle("Ticket Kategorileri 2/2");

        for (let i = 3; i < 6; i++) {
            const input = new TextInputBuilder()
                .setCustomId(`name_${i}`)
                .setLabel(
                    `Ticket ${i + 1} adı`
                )
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(45);

            modal.addComponents(
                new ActionRowBuilder().addComponents(input)
            );
        }

        return interaction.showModal(modal);
    }

    // --------------------------------------------------
    // TICKET NAMES SECOND
    // --------------------------------------------------

    if (customId === "ticket_names_second") {
        const session = setupSessions.get(
            interaction.user.id
        );

        if (!session) {
            return safeReply(
                interaction,
                "Kurulum oturumun bulunamadı.",
                { ephemeral: true }
            );
        }

        session.buttonNames.push(
            interaction.fields.getTextInputValue("name_3"),
            interaction.fields.getTextInputValue("name_4"),
            interaction.fields.getTextInputValue("name_5")
        );

        const guildData = getGuildData(
            interaction.guild.id
        );

        guildData.ticket.staffRoleId =
            session.staffRoleId;

        guildData.ticket.categoryId =
            session.categoryId;

        guildData.ticket.buttonNames =
            session.buttonNames.slice(0, 6);

        saveDatabase();

        setupSessions.delete(
            interaction.user.id
        );

        const embed = new EmbedBuilder()
            .setTitle("🎫 Destek Sistemi")
            .setDescription(
                [
                    "Destek almak için aşağıdaki menüden kategori seç.",
                    "",
                    "Her kullanıcı aynı anda yalnızca bir ticket açabilir."
                ].join("\n")
            )
            .setTimestamp();

        await interaction.reply({
            content: "Ticket paneli başarıyla hazırlandı.",
            ephemeral: true
        });

        return interaction.channel.send({
            embeds: [embed],
            components: [createTicketPanel(guildData)]
        });
    }

    // --------------------------------------------------
    // AUTO REPLY
    // --------------------------------------------------

    if (customId === "moderation_auto_reply") {
        if (!isAdministrator(interaction.member)) {
            return safeReply(
                interaction,
                "Bu işlemi yapamazsın.",
                { ephemeral: true }
            );
        }

        const guildData = getGuildData(
            interaction.guild.id
        );

        const trigger = normalizeText(
            interaction.fields.getTextInputValue("trigger")
        );

        const response =
            interaction.fields.getTextInputValue("response");

        guildData.moderation.autoReplies[trigger] =
            response;

        saveDatabase();

        return safeReply(
            interaction,
            `\`${trigger}\` otomatik cevabı ayarlandı.`,
            { ephemeral: true }
        );
    }

    // --------------------------------------------------
    // BAD WORDS
    // --------------------------------------------------

    if (customId === "moderation_bad_words") {
        if (!isAdministrator(interaction.member)) {
            return safeReply(
                interaction,
                "Bu işlemi yapamazsın.",
                { ephemeral: true }
            );
        }

        const guildData = getGuildData(
            interaction.guild.id
        );

        const raw =
            interaction.fields.getTextInputValue("words");

        guildData.moderation.badWords =
            raw
                .split(",")
                .map(word => normalizeText(word))
                .filter(Boolean);

        saveDatabase();

        return safeReply(
            interaction,
            "Küfür filtresi güncellendi.",
            { ephemeral: true }
        );
    }

    // --------------------------------------------------
    // APPLICATION QUESTION COUNT
    // --------------------------------------------------

    if (customId === "application_question_count") {
        if (!isAdministrator(interaction.member)) {
            return safeReply(
                interaction,
                "Bu işlemi yapamazsın.",
                { ephemeral: true }
            );
        }

        const count = Number(
            interaction.fields.getTextInputValue("count")
        );

        if (
            !Number.isInteger(count) ||
            count < 1 ||
            count > 5
        ) {
            return safeReply(
                interaction,
                "Soru sayısı 1 ile 5 arasında olmalı.",
                { ephemeral: true }
            );
        }

        applicationSetupSessions.set(
            interaction.user.id,
            {
                guildId: interaction.guild.id,
                count
            }
        );

        const modal = new ModalBuilder()
            .setCustomId("application_questions")
            .setTitle("Başvuru Soruları");

        for (let i = 0; i < count; i++) {
            const input = new TextInputBuilder()
                .setCustomId(`question_${i}`)
                .setLabel(
                    `Soru ${i + 1}`
                )
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000);

            modal.addComponents(
                new ActionRowBuilder().addComponents(input)
            );
        }

        return interaction.showModal(modal);
    }

    // --------------------------------------------------
    // APPLICATION QUESTIONS
    // --------------------------------------------------

    if (customId === "application_questions") {
        if (!isAdministrator(interaction.member)) {
            return safeReply(
                interaction,
                "Bu işlemi yapamazsın.",
                { ephemeral: true }
            );
        }

        const session =
            applicationSetupSessions.get(
                interaction.user.id
            );

        if (!session) {
            return safeReply(
                interaction,
                "Başvuru kurulum oturumun bulunamadı.",
                { ephemeral: true }
            );
        }

        const questions = [];

        for (let i = 0; i < session.count; i++) {
            questions.push(
                interaction.fields.getTextInputValue(
                    `question_${i}`
                )
            );
        }

        const guildData = getGuildData(
            interaction.guild.id
        );

        guildData.application.questions =
            questions;

        saveDatabase();

        session.questions = questions;

        const row = new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
                .setCustomId("application_role")
                .setPlaceholder(
                    "Başvuru kabul edilince verilecek rolü seç"
                )
                .setMinValues(1)
                .setMaxValues(1)
        );

        return interaction.reply({
            content:
                "Başvuru kabul edildiğinde verilecek rolü seç.",
            components: [row],
            ephemeral: true
        });
    }

    // --------------------------------------------------
    // APPLICATION SUBMIT
    // --------------------------------------------------

    if (customId === "application_submit") {
        const guildData = getGuildData(
            interaction.guild.id
        );

        const questions =
            guildData.application.questions;

        if (!questions.length) {
            return safeReply(
                interaction,
                "Başvuru sistemi henüz ayarlanmamış.",
                { ephemeral: true }
            );
        }

        const answers = [];

        for (let i = 0; i < questions.length; i++) {
            const answer =
                interaction.fields.getTextInputValue(
                    `answer_${i}`
                );

            answers.push(answer);
        }

        const owner = await interaction.guild.fetchOwner()
            .catch(() => null);

        if (!owner) {
            return safeReply(
                interaction,
                "Sunucu sahibine ulaşılamadı.",
                { ephemeral: true }
            );
        }

        const embed = new EmbedBuilder()
            .setTitle("📋 Yeni Başvuru")
            .setDescription(
                [
                    `👤 **Başvuran:** ${interaction.user}`,
                    "",
                    ...questions.map(
                        (question, index) =>
                            `**${index + 1}. ${question}**\n${answers[index]}`
                    )
                ].join("\n\n")
            )
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `application_accept:${interaction.user.id}`
                )
                .setLabel("Kabul Et")
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId(
                    `application_reject:${interaction.user.id}`
                )
                .setLabel("Reddet")
                .setStyle(ButtonStyle.Danger)
        );

        await owner.send({
            embeds: [embed],
            components: [row]
        }).catch(() => {});

        return interaction.reply({
            content:
                "Başvurun başarıyla gönderildi.",
            ephemeral: true
        });
    }
}

// ======================================================
// APPLICATION BUTTONS
// ======================================================

async function handleApplicationButton(interaction) {
    const guildData = getGuildData(
        interaction.guild.id
    );

    if (interaction.customId === "application_start") {
        const questions =
            guildData.application.questions;

        if (!questions.length) {
            return safeReply(
                interaction,
                "Başvuru sistemi henüz ayarlanmamış.",
                { ephemeral: true }
            );
        }

        const modal = new ModalBuilder()
            .setCustomId("application_submit")
            .setTitle("Başvuru Formu");

        for (let i = 0; i < questions.length; i++) {
            const input = new TextInputBuilder()
                .setCustomId(`answer_${i}`)
                .setLabel(
                    questions[i].slice(0, 45)
                )
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000);

            modal.addComponents(
                new ActionRowBuilder().addComponents(input)
            );
        }

        return interaction.showModal(modal);
    }

    if (
        interaction.customId.startsWith(
            "application_accept:"
        )
    ) {
        if (
            interaction.user.id !==
            interaction.guild.ownerId
        ) {
            return safeReply(
                interaction,
                "Sadece sunucu sahibi başvuruları kabul edebilir.",
                { ephemeral: true }
            );
        }

        await interaction.deferUpdate();

        const applicantId =
            interaction.customId.split(":")[1];

        const applicant =
            await interaction.guild.members
                .fetch(applicantId)
                .catch(() => null);

        if (!applicant) {
            return interaction.editReply({
                content:
                    "Başvuran kişi artık sunucuda değil."
            }).catch(() => {});
        }

        if (guildData.application.roleId) {
            const role =
                interaction.guild.roles.cache.get(
                    guildData.application.roleId
                );

            if (role) {
                await applicant.roles.add(role)
                    .catch(error => {
                        console.error(
                            "Başvuru rolü verilemedi:",
                            error
                        );
                    });
            }
        }

        await applicant.send(
            "🎉 Başvurun kabul edildi!"
        ).catch(() => {});

        return interaction.editReply({
            content:
                `Başvuru ${applicant.user.tag} için kabul edildi.`,
            components: []
        }).catch(() => {});
    }

    if (
        interaction.customId.startsWith(
            "application_reject:"
        )
    ) {
        if (
            interaction.user.id !==
            interaction.guild.ownerId
        ) {
            return safeReply(
                interaction,
                "Sadece sunucu sahibi başvuruları reddedebilir.",
                { ephemeral: true }
            );
        }

        await interaction.deferUpdate();

        const applicantId =
            interaction.customId.split(":")[1];

        const applicant =
            await client.users.fetch(
                applicantId
            ).catch(() => null);

        if (applicant) {
            await applicant.send(
                "Başvurun reddedildi."
            ).catch(() => {});
        }

        return interaction.editReply({
            content:
                "Başvuru reddedildi.",
            components: []
        }).catch(() => {});
    }
          }
// ======================================================
// GIVEAWAY
// ======================================================

async function handleGiveawayButton(interaction) {
    const [type, giveawayId] =
        interaction.customId.split(":");

    if (type !== "giveaway_join") {
        return false;
    }

    const giveaway =
        giveawaySessions.get(
            interaction.message.id
        );

    if (!giveaway) {
        return safeReply(
            interaction,
            "Bu çekiliş artık aktif değil.",
            { ephemeral: true }
        );
    }

    if (Date.now() >= giveaway.endAt) {
        return safeReply(
            interaction,
            "Bu çekiliş sona erdi.",
            { ephemeral: true }
        );
    }

    if (giveaway.participants.has(
        interaction.user.id
    )) {
        return safeReply(
            interaction,
            "Çekilişe zaten katıldın.",
            { ephemeral: true }
        );
    }

    giveaway.participants.add(
        interaction.user.id
    );

    await interaction.deferUpdate();

    return interaction.followUp({
        content: "Çekilişe katıldın! 🎉",
        ephemeral: true
    }).catch(() => {});
}

async function finishGiveaway(giveawayId) {
    const giveaway =
        giveawaySessions.get(giveawayId);

    if (!giveaway) {
        return;
    }

    giveawaySessions.delete(giveawayId);

    const guild =
        client.guilds.cache.get(
            giveaway.guildId
        );

    if (!guild) {
        return;
    }

    const channel =
        guild.channels.cache.get(
            giveaway.channelId
        );

    if (!channel) {
        return;
    }

    const message =
        await channel.messages.fetch(
            giveaway.messageId
        ).catch(() => null);

    if (!message) {
        return;
    }

    const participants =
        [...giveaway.participants];

    if (!participants.length) {
        const embed = new EmbedBuilder()
            .setTitle("🎉 ÇEKİLİŞ SONA ERDİ")
            .setDescription(
                [
                    `🎁 **Ödül:** ${giveaway.prize}`,
                    "",
                    "Katılımcı olmadığı için kazanan çıkmadı."
                ].join("\n")
            )
            .setTimestamp();

        return message.edit({
            embeds: [embed],
            components: []
        }).catch(() => {});
    }

    const shuffled = [...participants];

    for (
        let i = shuffled.length - 1;
        i > 0;
        i--
    ) {
        const j =
            Math.floor(
                Math.random() * (i + 1)
            );

        [shuffled[i], shuffled[j]] =
            [shuffled[j], shuffled[i]];
    }

    const winners =
        shuffled.slice(
            0,
            Math.min(
                giveaway.winners,
                shuffled.length
            )
        );

    const mentions =
        winners
            .map(id => `<@${id}>`)
            .join(", ");

    const embed = new EmbedBuilder()
        .setTitle("🎉 ÇEKİLİŞ SONA ERDİ")
        .setDescription(
            [
                `🎁 **Ödül:** ${giveaway.prize}`,
                `🏆 **Kazanan:** ${mentions}`
            ].join("\n")
        )
        .setTimestamp();

    await message.edit({
        embeds: [embed],
        components: []
    }).catch(() => {});

    await channel.send({
        content:
            `🎉 Tebrikler ${mentions}! **${giveaway.prize}** kazandınız!`
    }).catch(() => {});
}

// ======================================================
// DROP
// ======================================================

async function handleDropButton(interaction) {
    const [type, dropId] =
        interaction.customId.split(":");

    if (type !== "drop_claim") {
        return false;
    }

    const drop =
        dropSessions.get(
            interaction.message.id
        );

    if (!drop) {
        return safeReply(
            interaction,
            "Bu drop zaten alındı.",
            { ephemeral: true }
        );
    }

    dropSessions.delete(
        interaction.message.id
    );

    await interaction.deferUpdate();

    const embed = new EmbedBuilder()
        .setTitle("🎁 DROP KAZANILDI")
        .setDescription(
            [
                `🎁 **Ödül:** ${drop.prize}`,
                "",
                `🏆 **Kazanan:** ${interaction.user}`
            ].join("\n")
        )
        .setTimestamp();

    await interaction.message.edit({
        embeds: [embed],
        components: []
    }).catch(() => {});

    return interaction.channel.send({
        content:
            `🎉 ${interaction.user} dropu ilk alan kişi oldu ve **${drop.prize}** kazandı!`
    }).catch(() => {});
}

// ======================================================
// CLAN VOTING
// ======================================================

function createClanVoteMenu(guildData, voteData) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId("clan_vote_menu")
        .setPlaceholder("Bir klan seç ve oyunu ver");

    for (const clan of guildData.clans.slice(0, 25)) {
        const count =
            voteData.votes.get(clan)?.size || 0;

        menu.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(clan.slice(0, 100))
                .setValue(clan.slice(0, 100))
                .setDescription(
                    `${count} oy`
                )
        );
    }

    return new ActionRowBuilder()
        .addComponents(menu);
}

async function startClanVote(interaction) {
    const guildData = getGuildData(
        interaction.guild.id
    );

    if (!guildData.clans.length) {
        return safeReply(
            interaction,
            "Önce `/klanekle` ile klan eklemelisin.",
            { ephemeral: true }
        );
    }

    if (
        clanVoteSessions.has(
            interaction.guild.id
        )
    ) {
        return safeReply(
            interaction,
            "Zaten aktif bir klan oylaması var.",
            { ephemeral: true }
        );
    }

    const voteData = {
        guildId: interaction.guild.id,
        channelId: interaction.channel.id,
        messageId: null,
        voters: new Set(),
        votes: new Map()
    };

    for (const clan of guildData.clans) {
        voteData.votes.set(
            clan,
            new Set()
        );
    }

    clanVoteSessions.set(
        interaction.guild.id,
        voteData
    );

    const embed = new EmbedBuilder()
        .setTitle("⚔️ KLAN OYLAMASI")
        .setDescription(
            [
                "Favori klanına oy ver.",
                "",
                "⚠️ Her kullanıcı yalnızca bir kez oy verebilir.",
                "Oy verdikten sonra değişiklik yapılamaz."
            ].join("\n")
        )
        .setTimestamp();

    const message =
        await interaction.reply({
            embeds: [embed],
            components: [
                createClanVoteMenu(
                    guildData,
                    voteData
                )
            ],
            fetchReply: true
        });

    voteData.messageId =
        message.id;
}

async function handleClanMenu(interaction) {
    const voteData =
        clanVoteSessions.get(
            interaction.guild.id
        );

    if (!voteData) {
        return safeReply(
            interaction,
            "Aktif oylama bulunmuyor.",
            { ephemeral: true }
        );
    }

    if (
        voteData.voters.has(
            interaction.user.id
        )
    ) {
        return safeReply(
            interaction,
            "Zaten oy kullandın.",
            { ephemeral: true }
        );
    }

    const clan =
        interaction.values[0];

    if (!voteData.votes.has(clan)) {
        return safeReply(
            interaction,
            "Bu klan artık mevcut değil.",
            { ephemeral: true }
        );
    }

    voteData.voters.add(
        interaction.user.id
    );

    voteData.votes
        .get(clan)
        .add(interaction.user.id);

    await interaction.deferUpdate();

    const guildData = getGuildData(
        interaction.guild.id
    );

    const embed = new EmbedBuilder()
        .setTitle("⚔️ KLAN OYLAMASI")
        .setDescription(
            [
                "Favori klanına oy ver.",
                "",
                ...guildData.clans.map(
                    name =>
                        `**${name}:** ${voteData.votes.get(name)?.size || 0} oy`
                ),
                "",
                "⚠️ Her kullanıcı yalnızca bir kez oy verebilir."
            ].join("\n")
        )
        .setTimestamp();

    return interaction.message.edit({
        embeds: [embed],
        components: [
            createClanVoteMenu(
                guildData,
                voteData
            )
        ]
    }).catch(() => {});
}

async function finishClanVote(interaction) {
    const voteData =
        clanVoteSessions.get(
            interaction.guild.id
        );

    if (!voteData) {
        return safeReply(
            interaction,
            "Aktif oylama bulunmuyor.",
            { ephemeral: true }
        );
    }

    clanVoteSessions.delete(
        interaction.guild.id
    );

    const results =
        [...voteData.votes.entries()]
            .map(([clan, users]) => ({
                clan,
                votes: users.size
            }))
            .sort(
                (a, b) => b.votes - a.votes
            );

    const embed = new EmbedBuilder()
        .setTitle("🏁 KLAN OYLAMASI SONA ERDİ")
        .setDescription(
            results.length
                ? results
                    .map(
                        (item, index) =>
                            `**${index + 1}. ${item.clan}** — ${item.votes} oy`
                    )
                    .join("\n")
                : "Oy bulunamadı."
        )
        .setTimestamp();

    await interaction.reply({
        embeds: [embed]
    });

    const channel =
        interaction.guild.channels.cache.get(
            voteData.channelId
        );

    if (channel && voteData.messageId) {
        const message =
            await channel.messages.fetch(
                voteData.messageId
            ).catch(() => null);

        if (message) {
            await message.edit({
                embeds: [embed],
                components: []
            }).catch(() => {});
        }
    }
}
// ======================================================
// INTERACTION CREATE
// ======================================================

client.on("interactionCreate", async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            return await handleChatInput(
                interaction
            );
        }

        if (interaction.isStringSelectMenu()) {
            return await handleStringSelect(
                interaction
            );
        }

        if (interaction.isRoleSelectMenu()) {
            return await handleRoleSelect(
                interaction
            );
        }

        if (interaction.isChannelSelectMenu()) {
            return await handleChannelSelect(
                interaction
            );
        }

        if (interaction.isModalSubmit()) {
            return await handleModalSubmit(
                interaction
            );
        }

        if (interaction.isButton()) {
            if (
                interaction.customId ===
                    "ticket_claim" ||
                interaction.customId ===
                    "ticket_help" ||
                interaction.customId ===
                    "ticket_close"
            ) {
                return await handleTicketButton(
                    interaction
                );
            }

            if (
                interaction.customId ===
                    "application_start" ||
                interaction.customId.startsWith(
                    "application_accept:"
                ) ||
                interaction.customId.startsWith(
                    "application_reject:"
                )
            ) {
                return await handleApplicationButton(
                    interaction
                );
            }

            if (
                interaction.customId.startsWith(
                    "giveaway_join:"
                )
            ) {
                return await handleGiveawayButton(
                    interaction
                );
            }

            if (
                interaction.customId.startsWith(
                    "drop_claim:"
                )
            ) {
                return await handleDropButton(
                    interaction
                );
            }

            return;
        }
    } catch (error) {
        console.error(
            "Interaction hatası:",
            error
        );

        try {
            if (
                interaction.deferred ||
                interaction.replied
            ) {
                await interaction.editReply({
                    content:
                        "İşlem sırasında bir hata oluştu."
                }).catch(() => {});
            } else {
                await interaction.reply({
                    content:
                        "İşlem sırasında bir hata oluştu.",
                    ephemeral: true
                }).catch(() => {});
            }
        } catch {}
    }
});

// ======================================================
// MESSAGE CREATE
// ======================================================

client.on("messageCreate", async message => {
    if (!message.guild) {
        return;
    }

    if (message.author.bot) {
        return;
    }

    const guildData = getGuildData(
        message.guild.id
    );

    guildData.statistics.totalMessages++;

    if (
        guildData.statistics.totalMessages % 10 ===
        0
    ) {
        saveDatabase();
    }

    // --------------------------------------------------
    // PREFIX COMMANDS
    // --------------------------------------------------

    const content =
        message.content.trim();

    if (
        content === "k!lock" ||
        content === "k!unlock" ||
        content === "k!sıfırla" ||
        content === "!serverinfo"
    ) {
        if (!isAdministrator(message.member)) {
            return message.reply(
                "Bu komutu kullanmak için yönetici olmalısın."
            ).catch(() => {});
        }

        if (content === "k!lock") {
            await message.channel.permissionOverwrites.edit(
                message.guild.roles.everyone,
                {
                    SendMessages: false
                }
            ).catch(() => {});

            return message.channel.send(
                "🔒 Kanal başarıyla kilitlendi."
            );
        }

        if (content === "k!unlock") {
            await message.channel.permissionOverwrites.edit(
                message.guild.roles.everyone,
                {
                    SendMessages: null
                }
            ).catch(() => {});

            return message.channel.send(
                "🔓 Kanal başarıyla açıldı."
            );
        }

        if (content === "k!sıfırla") {
            const fetched =
                await message.channel.messages.fetch({
                    limit: 100
                }).catch(() => null);

            if (fetched) {
                await message.channel.bulkDelete(
                    fetched,
                    true
                ).catch(() => {});
            }

            const confirmation =
                await message.channel.send(
                    "Kanal başarıyla sıfırlandı."
                ).catch(() => null);

            if (confirmation) {
                setTimeout(() => {
                    confirmation.delete()
                        .catch(() => {});
                }, 3000);
            }

            return;
        }

        if (content === "!serverinfo") {
            return sendServerInfo(
                message
            );
        }
    }

    // --------------------------------------------------
    // AUTO RESPONSE
    // --------------------------------------------------

    const automaticResponse =
        guildData.moderation.autoReplies[
            normalizeText(message.content)
        ];

    if (automaticResponse) {
        await message.channel.send(
            automaticResponse
        ).catch(() => {});

        return;
    }

    // --------------------------------------------------
    // SUGGESTION CHANNEL
    // --------------------------------------------------

    if (
        guildData.moderation.suggestionChannel &&
        message.channel.id ===
            guildData.moderation.suggestionChannel
    ) {
        if (
            !normalizeText(
                message.content
            ).startsWith("öneri:")
        ) {
            await message.delete()
                .catch(() => {});

            const warning =
                await message.channel.send(
                    `${message.author}, bu kanal sadece önerilere açıktır. Önerini \`Öneri:\` ile başlat.`
                ).catch(() => null);

            if (warning) {
                setTimeout(() => {
                    warning.delete()
                        .catch(() => {});
                }, 3000);
            }

            return;
        }
    }

    // --------------------------------------------------
    // LINK FILTER
    // --------------------------------------------------

    if (
        guildData.moderation.linkChannels
            .includes(message.channel.id)
    ) {
        if (
            !isAdministrator(message.member) &&
            /(https?:\/\/|www\.|discord\.gg\/)/i
                .test(message.content)
        ) {
            await message.delete()
                .catch(() => {});

            const warning =
                await message.channel.send(
                    `${message.author}, bu kanalda link paylaşamazsın.`
                ).catch(() => null);

            if (warning) {
                setTimeout(() => {
                    warning.delete()
                        .catch(() => {});
                }, 3000);
            }

            return;
        }
    }

    // --------------------------------------------------
    // BAD WORD FILTER
    // --------------------------------------------------

    if (
        guildData.moderation.badWords.length &&
        !isAdministrator(message.member)
    ) {
        const normalized =
            normalizeText(message.content);

        const hasBadWord =
            guildData.moderation.badWords.some(
                word =>
                    word &&
                    normalized.includes(word)
            );

        if (hasBadWord) {
            await message.delete()
                .catch(() => {});

            const warning =
                await message.channel.send(
                    `${message.author}, bu kelimeleri kullanamazsın.`
                ).catch(() => null);

            if (warning) {
                setTimeout(() => {
                    warning.delete()
                        .catch(() => {});
                }, 3000);
            }

            return;
        }
    }
});

// ======================================================
// SERVER INFO
// ======================================================

async function sendServerInfo(message) {
    const guild = message.guild;

    let activeMembers = 0;

    for (const member of guild.members.cache.values()) {
        if (
            member.presence &&
            member.presence.status &&
            member.presence.status !== "offline"
        ) {
            activeMembers++;
        }
    }

    const embed = new EmbedBuilder()
        .setTitle(`📊 ${guild.name} Sunucu Bilgileri`)
        .setThumbnail(
            guild.iconURL({
                size: 256
            })
        )
        .addFields(
            {
                name: "👑 Sunucu Sahibi",
                value: `<@${guild.ownerId}>`,
                inline: true
            },
            {
                name: "👥 Üye Sayısı",
                value: `${guild.memberCount}`,
                inline: true
            },
            {
                name: "📁 Kanal Sayısı",
                value: `${guild.channels.cache.size}`,
                inline: true
            },
            {
                name: "🟢 Aktif Üye",
                value: `${activeMembers}`,
                inline: true
            },
            {
                name: "💬 Toplam Mesaj",
                value:
                    `${getGuildData(guild.id).statistics.totalMessages}`,
                inline: true
            }
        )
        .setTimestamp();

    return message.channel.send({
        embeds: [embed]
    });
}
// ======================================================
// MESSAGE DELETE LOG
// ======================================================

client.on("messageDelete", async message => {
    if (!message.guild) {
        return;
    }

    if (message.author?.bot) {
        return;
    }

    const guildData = getGuildData(
        message.guild.id
    );

    if (!guildData.moderation.logChannel) {
        return;
    }

    const channel =
        message.guild.channels.cache.get(
            guildData.moderation.logChannel
        );

    if (!channel) {
        return;
    }

    const content =
        message.content ||
        "[Mesaj içeriği alınamadı]";

    const embed = new EmbedBuilder()
        .setTitle("🗑️ Mesaj Silindi")
        .addFields(
            {
                name: "👤 Kullanıcı",
                value:
                    `${message.author?.tag || "Bilinmiyor"}`
            },
            {
                name: "📍 Kanal",
                value:
                    `${message.channel || message.channelId}`
            },
            {
                name: "💬 Mesaj",
                value:
                    content.slice(0, 1024)
            }
        )
        .setTimestamp();

    await channel.send({
        embeds: [embed]
    }).catch(() => {});
});

// ======================================================
// MESSAGE UPDATE LOG
// ======================================================

client.on("messageUpdate", async (
    oldMessage,
    newMessage
) => {
    if (!newMessage.guild) {
        return;
    }

    if (newMessage.author?.bot) {
        return;
    }

    if (
        oldMessage.content ===
        newMessage.content
    ) {
        return;
    }

    const guildData = getGuildData(
        newMessage.guild.id
    );

    if (!guildData.moderation.logChannel) {
        return;
    }

    const channel =
        newMessage.guild.channels.cache.get(
            guildData.moderation.logChannel
        );

    if (!channel) {
        return;
    }

    const oldContent =
        oldMessage.content ||
        "[Eski mesaj alınamadı]";

    const newContent =
        newMessage.content ||
        "[Yeni mesaj alınamadı]";

    const embed = new EmbedBuilder()
        .setTitle("✏️ Mesaj Düzenlendi")
        .addFields(
            {
                name: "👤 Kullanıcı",
                value:
                    `${newMessage.author?.tag || "Bilinmiyor"}`
            },
            {
                name: "📍 Kanal",
                value:
                    `${newMessage.channel}`
            },
            {
                name: "Önceki",
                value:
                    oldContent.slice(0, 1024)
            },
            {
                name: "Yeni",
                value:
                    newContent.slice(0, 1024)
            }
        )
        .setTimestamp();

    await channel.send({
        embeds: [embed]
    }).catch(() => {});
});

// ======================================================
// MEMBER JOIN
// ======================================================

client.on("guildMemberAdd", async member => {
    const guildData = getGuildData(
        member.guild.id
    );

    // --------------------------------------------------
    // AUTO ROLE
    // --------------------------------------------------

    if (guildData.moderation.autoRoleId) {
        const role =
            member.guild.roles.cache.get(
                guildData.moderation.autoRoleId
            );

        if (role) {
            await member.roles.add(role)
                .catch(error => {
                    console.error(
                        "Otomatik rol verilemedi:",
                        error
                    );
                });
        }
    }

    // --------------------------------------------------
    // WELCOME
    // --------------------------------------------------

    if (
        !guildData.moderation.welcomeChannel
    ) {
        return;
    }

    const channel =
        member.guild.channels.cache.get(
            guildData.moderation.welcomeChannel
        );

    if (!channel) {
        return;
    }

    const createdAt =
        Math.floor(
            member.user.createdTimestamp /
            1000
        );

    const accountAge =
        Date.now() -
        member.user.createdTimestamp;

    const days =
        Math.floor(
            accountAge /
            (24 * 60 * 60 * 1000)
        );

    let accountStatus = "🟢 Normal";

    if (days < 7) {
        accountStatus = "🟠 Yeni hesap";
    } else if (days < 30) {
        accountStatus = "🟡 Dikkat";
    }

    const embed = new EmbedBuilder()
        .setTitle("👋 Yeni Üye")
        .setDescription(
            `${member} sunucuya katıldı!`
        )
        .addFields(
            {
                name: "👤 Üye",
                value:
                    `${member.user.tag}`,
                inline: true
            },
            {
                name: "⏰ Katılma Zamanı",
                value:
                    `<t:${Math.floor(Date.now() / 1000)}:F>`,
                inline: true
            },
            {
                name: "📅 Hesap Oluşturulma",
                value:
                    `<t:${createdAt}:F>`,
                inline: true
            },
            {
                name: "⌛ Hesap Yaşı",
                value:
                    `${days} gün`,
                inline: true
            },
            {
                name: "🛡️ Hesap Durumu",
                value:
                    accountStatus,
                inline: true
            }
        )
        .setThumbnail(
            member.user.displayAvatarURL({
                size: 256
            })
        )
        .setTimestamp();

    await channel.send({
        embeds: [embed]
    }).catch(() => {});
});

// ======================================================
// MEMBER LEAVE
// ======================================================

client.on("guildMemberRemove", async member => {
    const guildData = getGuildData(
        member.guild.id
    );

    if (
        !guildData.moderation.leaveChannel
    ) {
        return;
    }

    const channel =
        member.guild.channels.cache.get(
            guildData.moderation.leaveChannel
        );

    if (!channel) {
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle("👋 Üye Ayrıldı")
        .setDescription(
            `${member.user.tag} sunucudan ayrıldı.`
        )
        .addFields(
            {
                name: "👤 Kullanıcı",
                value:
                    `${member.user.tag}`,
                inline: true
            },
            {
                name: "🕒 Ayrılma",
                value:
                    `<t:${Math.floor(Date.now() / 1000)}:F>`,
                inline: true
            }
        )
        .setThumbnail(
            member.user.displayAvatarURL({
                size: 256
            })
        )
        .setTimestamp();

    await channel.send({
        embeds: [embed]
    }).catch(() => {});
});

// ======================================================
// ERROR HANDLING
// ======================================================

client.on("error", error => {
    console.error(
        "Discord client error:",
        error
    );
});

client.on(
    "warn",
    warning => {
        console.warn(
            "Discord warning:",
            warning
        );
    }
);

process.on(
    "unhandledRejection",
    error => {
        console.error(
            "Unhandled rejection:",
            error
        );
    }
);

process.on(
    "uncaughtException",
    error => {
        console.error(
            "Uncaught exception:",
            error
        );
    }
);

// ======================================================
// SHUTDOWN
// ======================================================

function shutdown(signal) {
    console.log(
        `${signal} alındı. Bot kapatılıyor...`
    );

    try {
        saveDatabase();
    } catch (error) {
        console.error(
            "Shutdown database hatası:",
            error
        );
    }

    try {
        client.destroy();
    } catch {}

    process.exit(0);
}

process.on(
    "SIGTERM",
    () => shutdown("SIGTERM")
);

process.on(
    "SIGINT",
    () => shutdown("SIGINT")
);

// ======================================================
// LOGIN
// ======================================================

client.login(TOKEN)
    .then(() => {
        console.log(
            "Discord'a bağlanma işlemi başlatıldı."
        );
    })
    .catch(error => {
        console.error(
            "Discord login hatası:",
            error
        );
        process.exit(1);
    });
// ======================================================
// EK GÜVENLİK / YARDIMCI FONKSİYONLAR
// ======================================================

function channelIsText(channel) {
    return (
        channel &&
        (
            channel.type === ChannelType.GuildText ||
            channel.type === ChannelType.GuildAnnouncement
        )
    );
}

function memberCanManage(member) {
    if (!member) {
        return false;
    }

    return member.permissions.has(
        PermissionsBitField.Flags.ManageGuild
    ) || member.permissions.has(
        PermissionsBitField.Flags.Administrator
    );
}

function cleanChannelName(name) {
    return String(name || "")
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || "ticket";
}

function formatNumber(number) {
    return Number(number || 0)
        .toLocaleString("tr-TR");
}

// ======================================================
// TICKET NAME HELPER
// ======================================================

function getTicketOwnerId(channel) {
    const topic = channel.topic || "";

    const match =
        topic.match(
            /ticket-owner:(\d+)/
        );

    return match
        ? match[1]
        : null;
}

function getTicketClaimedId(channel) {
    const topic = channel.topic || "";

    const match =
        topic.match(
            /claimed:(\d+)/
        );

    return match
        ? match[1]
        : null;
}

// ======================================================
// TICKET STATUS
// ======================================================

function getTicketStatus(channel) {
    return {
        ownerId:
            getTicketOwnerId(channel),
        claimedBy:
            getTicketClaimedId(channel)
    };
}

// ======================================================
// TICKET EMBED
// ======================================================

function ticketInfoEmbed(
    ownerId,
    categoryName,
    claimedBy
) {
    return new EmbedBuilder()
        .setTitle(`🎫 ${categoryName}`)
        .setDescription(
            [
                `👤 **Ticket sahibi:** <@${ownerId}>`,
                claimedBy
                    ? `🔵 **Üstlenen:** <@${claimedBy}>`
                    : "⚪ **Henüz üstlenen yok.**",
                "",
                "Yetkili ekibi ticket ile ilgilenecektir.",
                "",
                "🔵 Üstlen — Ticketı sen yönet.",
                "🟡 Yardım — Diğer yetkililerin yazmasını aç.",
                "🔴 Kapat — Ticketı kapat."
            ].join("\n")
        )
        .setTimestamp();
}

// ======================================================
// TICKET PERMISSIONS
// ======================================================

async function lockOtherStaff(
    channel,
    guildData
) {
    const role =
        getTicketStaffRole(
            channel.guild,
            guildData
        );

    if (!role) {
        return;
    }

    await channel.permissionOverwrites.edit(
        role.id,
        {
            ViewChannel: true,
            SendMessages: false,
            ReadMessageHistory: true
        }
    ).catch(() => {});
}

async function unlockStaff(
    channel,
    guildData
) {
    const role =
        getTicketStaffRole(
            channel.guild,
            guildData
        );

    if (!role) {
        return;
    }

    await channel.permissionOverwrites.edit(
        role.id,
        {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
        }
    ).catch(() => {});
}

// ======================================================
// TRANSCRIPT
// ======================================================

async function createTranscript(channel) {
    let messages;

    try {
        messages =
            await channel.messages.fetch({
                limit: 100
            });
    } catch {
        messages = null;
    }

    if (!messages) {
        return "Transcript alınamadı.";
    }

    return [...messages.values()]
        .reverse()
        .map(message => {
            const time =
                new Date(
                    message.createdTimestamp
                ).toISOString();

            const author =
                message.author?.tag ||
                "Bilinmeyen kullanıcı";

            const content =
                message.content ||
                "[Embed / Dosya / İçerik]";

            return `[${time}] ${author}: ${content}`;
        })
        .join("\n");
}

// ======================================================
// LOG MESSAGE
// ======================================================

async function sendSimpleLog(
    guild,
    title,
    fields
) {
    const data =
        getGuildData(guild.id);

    if (!data.moderation.logChannel) {
        return;
    }

    const channel =
        guild.channels.cache.get(
            data.moderation.logChannel
        );

    if (!channel) {
        return;
    }

    const embed =
        new EmbedBuilder()
            .setTitle(title)
            .addFields(fields)
            .setTimestamp();

    await channel.send({
        embeds: [embed]
    }).catch(() => {});
}

// ======================================================
// USER ACCOUNT INFO
// ======================================================

function getAccountAgeDays(user) {
    if (!user?.createdTimestamp) {
        return 0;
    }

    return Math.floor(
        (
            Date.now() -
            user.createdTimestamp
        ) /
        (24 * 60 * 60 * 1000)
    );
}

function getAccountStatus(user) {
    const days =
        getAccountAgeDays(user);

    if (days < 7) {
        return "🟠 Yeni hesap";
    }

    if (days < 30) {
        return "🟡 Yeni sayılabilecek hesap";
    }

    return "🟢 Normal";
}

// ======================================================
// SAFE CHANNEL SEND
// ======================================================

async function safeChannelSend(
    channel,
    payload
) {
    if (!channelIsText(channel)) {
        return null;
    }

    try {
        return await channel.send(
            payload
        );
    } catch (error) {
        console.error(
            "Mesaj gönderilemedi:",
            error
        );

        return null;
    }
}

// ======================================================
// SAFE DELETE
// ======================================================

async function safeDeleteMessage(
    message
) {
    if (!message) {
        return;
    }

    await message.delete()
        .catch(() => {});
}

// ======================================================
// TEMPORARY WARNING
// ======================================================

async function temporaryWarning(
    channel,
    content,
    delay = 3000
) {
    const message =
        await safeChannelSend(
            channel,
            content
        );

    if (!message) {
        return;
    }

    setTimeout(() => {
        safeDeleteMessage(message);
    }, delay);
}

// ======================================================
// PREFIX CHECK
// ======================================================

function isPrefixCommand(
    content,
    command
) {
    return normalizeText(
        content
    ) === normalizeText(command);
}

// ======================================================
// LINK CHECK
// ======================================================

function containsLink(content) {
    return /(https?:\/\/|www\.|discord\.gg\/)/i
        .test(content || "");
}

// ======================================================
// BAD WORD CHECK
// ======================================================

function containsBadWord(
    content,
    badWords
) {
    const normalized =
        normalizeText(content);

    return badWords.some(
        word =>
            word &&
            normalized.includes(
                normalizeText(word)
            )
    );
  }
// ======================================================
// ADDITIONAL MODERATION COMMAND HELPERS
// ======================================================

async function lockChannel(channel) {
    if (!channel) {
        return false;
    }

    try {
        await channel.permissionOverwrites.edit(
            channel.guild.roles.everyone,
            {
                SendMessages: false
            }
        );

        return true;
    } catch (error) {
        console.error(
            "Kanal kilitleme hatası:",
            error
        );

        return false;
    }
}

async function unlockChannel(channel) {
    if (!channel) {
        return false;
    }

    try {
        await channel.permissionOverwrites.edit(
            channel.guild.roles.everyone,
            {
                SendMessages: null
            }
        );

        return true;
    } catch (error) {
        console.error(
            "Kanal açma hatası:",
            error
        );

        return false;
    }
}

async function clearChannel(channel) {
    if (!channel) {
        return 0;
    }

    try {
        const messages =
            await channel.messages.fetch({
                limit: 100
            });

        if (!messages.size) {
            return 0;
        }

        await channel.bulkDelete(
            messages,
            true
        );

        return messages.size;
    } catch (error) {
        console.error(
            "Kanal temizleme hatası:",
            error
        );

        return 0;
    }
}

// ======================================================
// CHANNEL TYPE HELPERS
// ======================================================

function isCategory(channel) {
    return (
        channel?.type ===
        ChannelType.GuildCategory
    );
}

function isGuildText(channel) {
    return (
        channel?.type ===
        ChannelType.GuildText
    );
}

// ======================================================
// DATABASE NORMALIZATION
// ======================================================

function normalizeGuildData(guildId) {
    const data =
        getGuildData(guildId);

    if (!data.ticket) {
        data.ticket = {};
    }

    if (!data.ticket.staffRoleId) {
        data.ticket.staffRoleId = null;
    }

    if (!data.ticket.categoryId) {
        data.ticket.categoryId = null;
    }

    if (
        !Array.isArray(
            data.ticket.buttonNames
        )
    ) {
        data.ticket.buttonNames = [
            "Genel Destek",
            "Teknik Destek",
            "Yetkili Başvurusu",
            "Satın Alma",
            "Şikayet",
            "Diğer"
        ];
    }

    if (!data.moderation) {
        data.moderation = {};
    }

    if (
        !data.moderation.autoReplies
    ) {
        data.moderation.autoReplies = {};
    }

    if (
        !Array.isArray(
            data.moderation.badWords
        )
    ) {
        data.moderation.badWords = [];
    }

    if (
        !Array.isArray(
            data.moderation.linkChannels
        )
    ) {
        data.moderation.linkChannels = [];
    }

    if (
        !Array.isArray(
            data.moderation.announcementChannels
        )
    ) {
        data.moderation.announcementChannels = [];
    }

    if (!data.application) {
        data.application = {};
    }

    if (
        !Array.isArray(
            data.application.questions
        )
    ) {
        data.application.questions = [];
    }

    if (!data.statistics) {
        data.statistics = {};
    }

    if (
        typeof data.statistics.totalMessages !==
        "number"
    ) {
        data.statistics.totalMessages = 0;
    }

    if (!Array.isArray(data.clans)) {
        data.clans = [];
    }

    return data;
}

// ======================================================
// CLEAN OLD CLANS
// ======================================================

function cleanClanNames(guildData) {
    const unique = [];

    for (const clan of guildData.clans) {
        const name =
            String(clan || "").trim();

        if (!name) {
            continue;
        }

        if (
            name.length > 100
        ) {
            continue;
        }

        if (
            unique.some(
                existing =>
                    normalizeText(existing) ===
                    normalizeText(name)
            )
        ) {
            continue;
        }

        unique.push(name);
    }

    guildData.clans =
        unique.slice(0, 25);
}

// ======================================================
// APPLICATION SESSION CLEANUP
// ======================================================

function cleanupApplicationSession(
    userId
) {
    applicationSetupSessions.delete(
        userId
    );
}

function cleanupTicketSession(
    userId
) {
    setupSessions.delete(
        userId
    );
}

// ======================================================
// GIVEAWAY CLEANUP
// ======================================================

function cleanupGiveaways() {
    const now = Date.now();

    for (
        const [
            id,
            giveaway
        ] of giveawaySessions
    ) {
        if (
            giveaway.endAt <= now
        ) {
            finishGiveaway(id)
                .catch(() => {});
        }
    }
}

// ======================================================
// SESSION CLEANUP
// ======================================================

setInterval(
    () => {
        cleanupGiveaways();
    },
    30_000
);

// ======================================================
// PERIODIC SAVE
// ======================================================

setInterval(
    () => {
        saveDatabase();
    },
    60_000
);

// ======================================================
// BOT STATUS
// ======================================================

function updateBotStatus() {
    if (!client.user) {
        return;
    }

    const guildCount =
        client.guilds.cache.size;

    const memberCount =
        client.guilds.cache.reduce(
            (total, guild) =>
                total +
                (guild.memberCount || 0),
            0
        );

    client.user.setPresence({
        activities: [
            {
                name:
                    `${guildCount} sunucu • ${formatNumber(memberCount)} üye`,
                type: 3
            }
        ],
        status: "online"
    });
}

setInterval(
    updateBotStatus,
    60_000
);

// ======================================================
// READY STATUS UPDATE
// ======================================================

client.once(
    "ready",
    () => {
        updateBotStatus();
    }
);

// ======================================================
// DATABASE STARTUP NORMALIZATION
// ======================================================

for (
    const guildId of Object.keys(database)
) {
    normalizeGuildData(
        guildId
    );

    cleanClanNames(
        database[guildId]
    );
}

saveDatabase();

// ======================================================
// BOT START MESSAGE
// ======================================================

console.log(
    "Bot sistemi başlatılıyor..."
);
// ======================================================
// EXTRA INTERACTION SAFETY
// ======================================================

async function acknowledgeInteraction(
    interaction
) {
    try {
        if (
            interaction.replied ||
            interaction.deferred
        ) {
            return true;
        }

        await interaction.deferReply({
            ephemeral: true
        });

        return true;
    } catch {
        return false;
    }
}

// ======================================================
// GUILD VALIDATION
// ======================================================

function validateGuildInteraction(
    interaction
) {
    return Boolean(
        interaction.guild &&
        interaction.member
    );
}

// ======================================================
// PERMISSION VALIDATION
// ======================================================

function canManageBot(
    member
) {
    if (!member) {
        return false;
    }

    return (
        member.permissions.has(
            PermissionsBitField.Flags.Administrator
        ) ||
        member.permissions.has(
            PermissionsBitField.Flags.ManageGuild
        )
    );
}

// ======================================================
// BOT ROLE CHECK
// ======================================================

function botCanManageRole(
    guild,
    role
) {
    if (!guild || !role) {
        return false;
    }

    const me =
        guild.members.me;

    if (!me) {
        return false;
    }

    return (
        me.permissions.has(
            PermissionsBitField.Flags.ManageRoles
        ) &&
        role.position <
            me.roles.highest.position
    );
}

// ======================================================
// BOT ROLE CHECK FOR CHANNEL
// ======================================================

function botCanManageChannel(
    guild
) {
    const me =
        guild.members.me;

    if (!me) {
        return false;
    }

    return me.permissions.has(
        PermissionsBitField.Flags.ManageChannels
    );
}

// ======================================================
// ERROR RESPONSE
// ======================================================

async function interactionError(
    interaction,
    message
) {
    try {
        if (
            interaction.deferred ||
            interaction.replied
        ) {
            await interaction.editReply({
                content: message,
                components: []
            });
        } else {
            await interaction.reply({
                content: message,
                ephemeral: true
            });
        }
    } catch {}
}

// ======================================================
// FINAL CLIENT EVENT SAFETY
// ======================================================

client.on(
    "invalidated",
    () => {
        console.error(
            "Discord session geçersiz hale geldi."
        );
    }
);

// ======================================================
// CACHE CLEANUP
// ======================================================

setInterval(
    () => {
        const now =
            Date.now();

        for (
            const [
                userId,
                session
            ] of setupSessions
        ) {
            if (
                session.createdAt &&
                now - session.createdAt >
                    15 * 60 * 1000
            ) {
                setupSessions.delete(
                    userId
                );
            }
        }

        for (
            const [
                userId,
                session
            ] of applicationSetupSessions
        ) {
            if (
                session.createdAt &&
                now - session.createdAt >
                    15 * 60 * 1000
            ) {
                applicationSetupSessions.delete(
                    userId
                );
            }
        }
    },
    60_000
);

// ======================================================
// SESSION CREATION HELPERS
// ======================================================

function createSetupSession(
    userId,
    data = {}
) {
    const session = {
        createdAt: Date.now(),
        ...data
    };

    setupSessions.set(
        userId,
        session
    );

    return session;
}

function createApplicationSession(
    userId,
    data = {}
) {
    const session = {
        createdAt: Date.now(),
        ...data
    };

    applicationSetupSessions.set(
        userId,
        session
    );

    return session;
}

// ======================================================
// REBUILD DATABASE AFTER START
// ======================================================

function rebuildDatabase() {
    for (
        const guildId of Object.keys(database)
    ) {
        const data =
            getGuildData(guildId);

        if (
            data.ticket.buttonNames.length >
            6
        ) {
            data.ticket.buttonNames =
                data.ticket.buttonNames.slice(
                    0,
                    6
                );
        }

        cleanClanNames(data);
    }

    saveDatabase();
}

rebuildDatabase();

// ======================================================
// BOT VERSION
// ======================================================

const BOT_VERSION = "1.0.0";

console.log(
    `Bot sürümü: ${BOT_VERSION}`
);

// ======================================================
// COMMAND INFORMATION
// ======================================================

const COMMAND_LIST = [
    "panel",
    "moderasyon",
    "cekilis",
    "drop",
    "duyuru",
    "basvuru",
    "klanekle",
    "klandel",
    "klanoyla",
    "klanbitir",
    "yardim"
];

console.log(
    `Komut sayısı: ${COMMAND_LIST.length}`
);

// ======================================================
// READY DEBUG
// ======================================================

client.once(
    "ready",
    () => {
        console.log(
            `Aktif sunucu sayısı: ${client.guilds.cache.size}`
        );
    }
);

// ======================================================
// PROCESS EXIT
// ======================================================

process.on(
    "exit",
    () => {
        try {
            saveDatabase();
        } catch {}
    }
);
// ======================================================
// FINAL DATABASE SAVE
// ======================================================

saveDatabase();

// ======================================================
// FINAL STARTUP CHECK
// ======================================================

if (
    !process.env.DISCORD_TOKEN
) {
    console.error(
        "HATA: Railway Variables kısmına DISCORD_TOKEN eklemelisin."
    );

    process.exit(1);
}

// ======================================================
// FINAL LOGIN
// ======================================================

(async () => {
    try {
        await client.login(
            process.env.DISCORD_TOKEN
        );

        console.log(
            "Discord bot bağlantısı başarılı."
        );
    } catch (error) {
        console.error(
            "Discord bağlantı hatası:",
            error
        );

        process.exit(1);
    }
})();
