const {
    Client,
    GatewayIntentBits,
    Partials,
    PermissionsBitField,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences
    ],
    partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
});

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "database.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
}

let db;

try {
    db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch {
    db = {};
}

function save() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function guildData(guildId) {
    if (!db[guildId]) {
        db[guildId] = {
            ticket: {
                staffRole: null,
                category: null,
                names: [
                    "Genel Destek",
                    "Teknik Destek",
                    "Oyuncu Destek",
                    "Yetkili Destek",
                    "Satın Alma",
                    "Diğer"
                ]
            },
            moderation: {
                autoRole: null,
                logChannel: null,
                welcomeChannel: null,
                suggestionChannel: null,
                announcementChannel: null,
                chatChannel: null,
                linkChannels: [],
                filteredWords: {},
                profanity: true,
                links: true
            },
            applications: {
                questions: [],
                role: null,
                panelChannel: null
            },
            clans: [],
            clanVote: null,
            messageCount: 0,
            raffles: {},
            drop: null
        };

        save();
    }

    return db[guildId];
}

function isAdmin(member) {
    return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

function isStaff(member, data) {
    if (!member) return false;

    if (isAdmin(member)) return true;

    if (
        data.ticket.staffRole &&
        member.roles.cache.has(data.ticket.staffRole)
    ) {
        return true;
    }

    return false;
}

function normalizeText(text) {
    return text
        .toLocaleLowerCase("tr-TR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[İı]/g, "i")
        .trim();
}

function cleanDuration(value) {
    const match = /^(\d+)(s|m|h|d)$/i.exec(value);

    if (!match) return null;

    const number = Number(match[1]);
    const unit = match[2].toLowerCase();

    const multipliers = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000
    };

    return number * multipliers[unit];
}

function safeChannelName(name) {
    return name
        .toLocaleLowerCase("tr-TR")
        .replace(/ı/g, "i")
        .replace(/ğ/g, "g")
        .replace(/ü/g, "u")
        .replace(/ş/g, "s")
        .replace(/ö/g, "o")
        .replace(/ç/g, "c")
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || "ticket";
}

function truncate(text, length = 1000) {
    if (!text) return "";

    return text.length > length
        ? text.slice(0, length - 3) + "..."
        : text;
}

function getOpenTicket(guild, userId) {
    return guild.channels.cache.find(channel => {
        return (
            channel.type === ChannelType.GuildText &&
            channel.topic?.startsWith(`ticket-owner:${userId}`)
        );
    });
}

function getTicketOwner(channel) {
    const topic = channel.topic || "";
    const match = topic.match(/ticket-owner:(\d+)/);
    return match ? match[1] : null;
}

function getTicketClaimant(channel) {
    const topic = channel.topic || "";
    const match = topic.match(/ticket-claimed:(\d+)/);
    return match ? match[1] : null;
}

const profanityWords = [
    "amk",
    "aq",
    "amina",
    "orospu",
    "orospuçocuğu",
    "piç",
    "sik",
    "sikerim",
    "siktir",
    "yarrak",
    "yavşak",
    "ibne",
    "kahpe"
];

function containsProfanity(text) {
    const normalized = normalizeText(text)
        .replace(/[^a-z0-9çğıöşü]/gi, "");

    return profanityWords.some(word => {
        const cleanWord = normalizeText(word)
            .replace(/[^a-z0-9çğıöşü]/gi, "");

        return normalized.includes(cleanWord);
    });
}
const commands = [
    {
        name: "panel",
        description: "Ticket sistemini kurar"
    },
    {
        name: "moderasyon",
        description: "Moderasyon sistemini kurar"
    },
    {
        name: "basvuru",
        description: "Yetkili başvuru sistemini kurar"
    },
    {
        name: "cekilis",
        description: "Çekiliş başlatır",
        options: [
            {
                name: "sure",
                description: "Örn: 10m, 1h, 1d",
                type: 3,
                required: true
            },
            {
                name: "kazanan_sayisi",
                description: "Kazanan sayısı",
                type: 4,
                required: true,
                min_value: 1,
                max_value: 20
            },
            {
                name: "odul",
                description: "Çekiliş ödülü",
                type: 3,
                required: true
            }
        ]
    },
    {
        name: "drop",
        description: "Drop başlatır",
        options: [
            {
                name: "odul",
                description: "Drop ödülü",
                type: 3,
                required: true
            }
        ]
    },
    {
        name: "duyuru",
        description: "Duyuru gönderir",
        options: [
            {
                name: "mesaj",
                description: "Duyuru mesajı",
                type: 3,
                required: true
            }
        ]
    },
    {
        name: "klanekle",
        description: "Oylamaya klan ekler",
        options: [
            {
                name: "klan",
                description: "Klan adı",
                type: 3,
                required: true
            }
        ]
    },
    {
        name: "klandel",
        description: "Oylamadan klan siler",
        options: [
            {
                name: "klan",
                description: "Silinecek klan",
                type: 3,
                required: true
            }
        ]
    },
    {
        name: "klanoyla",
        description: "Klan oylaması başlatır"
    },
    {
        name: "klanbitir",
        description: "Klan oylamasını bitirir"
    },
    {
        name: "serverinfo",
        description: "Sunucu bilgilerini gösterir"
    }
];

client.once("ready", async () => {
    console.log(`Bot aktif: ${client.user.tag}`);

    for (const guild of client.guilds.cache.values()) {
        guildData(guild.id);
    }

    try {
        await client.application.commands.set(commands);
        console.log("Slash komutları yüklendi.");
    } catch (error) {
        console.error("Komut yükleme hatası:", error);
    }

    client.user.setPresence({
        activities: [
            {
                name: "Sunucuyu koruyor",
                type: 3
            }
        ],
        status: "online"
    });
});

client.on("guildCreate", guild => {
    guildData(guild.id);
});

async function sendLog(guild, embed) {
    const data = guildData(guild.id);

    if (!data.moderation.logChannel) return;

    const channel = guild.channels.cache.get(
        data.moderation.logChannel
    );

    if (!channel) return;

    try {
        await channel.send({
            embeds: [embed]
        });
    } catch {}
}

async function createTranscript(channel) {
    const messages = [];
    let lastId;

    while (messages.length < 1000) {
        const options = {
            limit: 100
        };

        if (lastId) {
            options.before = lastId;
        }

        const fetched = await channel.messages.fetch(options);

        if (!fetched.size) break;

        messages.push(...fetched.values());
        lastId = fetched.last().id;

        if (fetched.size < 100) break;
    }

    messages.reverse();

    const lines = messages.map(message => {
        const date = new Date(message.createdTimestamp)
            .toLocaleString("tr-TR");

        return `[${date}] ${message.author.tag}: ${message.content}`;
    });

    return lines.join("\n");
}
const panelSetup = new Map();
const applicationSetup = new Map();

client.on("interactionCreate", async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            await handleCommand(interaction);
            return;
        }

        if (interaction.isStringSelectMenu()) {
            await handleStringSelect(interaction);
            return;
        }

        if (interaction.isRoleSelectMenu()) {
            await handleRoleSelect(interaction);
            return;
        }

        if (interaction.isChannelSelectMenu()) {
            await handleChannelSelect(interaction);
            return;
        }

        if (interaction.isModalSubmit()) {
            await handleModal(interaction);
            return;
        }

        if (interaction.isButton()) {
            await handleButton(interaction);
        }
    } catch (error) {
        console.error("Interaction hatası:", error);

        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({
                    content: "Bir hata oluştu.",
                    ephemeral: true
                });
            } catch {}
        }
    }
});

async function handleCommand(interaction) {
    const data = guildData(interaction.guild.id);

    if (interaction.commandName === "panel") {
        if (!isAdmin(interaction.member)) {
            return interaction.reply({
                content: "Bu sistemi sadece Yönetici yetkisi olanlar kurabilir.",
                ephemeral: true
            });
        }

        panelSetup.set(interaction.user.id, {
            guildId: interaction.guild.id,
            staffRole: null,
            category: null,
            names: []
        });

        const roles = interaction.guild.roles.cache
            .filter(role => role.id !== interaction.guild.id)
            .sort((a, b) => b.position - a.position)
            .first(25);

        const menu = new RoleSelectMenuBuilder()
            .setCustomId("ticket_staff_role")
            .setPlaceholder("Ticket yetkili rolünü seç");

        if (roles.length) {
            menu.setMinValues(1).setMaxValues(1);
        }

        await interaction.reply({
            content: "Ticket yetkili rolünü seç.",
            components: [
                new ActionRowBuilder().addComponents(menu)
            ],
            ephemeral: true
        });

        return;
    }

    if (interaction.commandName === "moderasyon") {
        if (!isAdmin(interaction.member)) {
            return interaction.reply({
                content: "Bu sistemi sadece Yönetici yetkisi olanlar kullanabilir.",
                ephemeral: true
            });
        }

        const menu = new StringSelectMenuBuilder()
            .setCustomId("moderation_menu")
            .setPlaceholder("Bir moderasyon sistemi seç")
            .addOptions(
                {
                    label: "Otomatik Rol",
                    value: "auto_role",
                    description: "Yeni üyeye otomatik rol verir"
                },
                {
                    label: "Otomatik Cevap",
                    value: "auto_reply",
                    description: "Kelimeye otomatik cevap verir"
                },
                {
                    label: "Küfür Filtresi",
                    value: "profanity",
                    description: "Küfür filtresini açıp kapatır"
                },
                {
                    label: "Link Engelleme",
                    value: "link",
                    description: "Seçilen kanallarda linkleri engeller"
                },
                {
                    label: "Log Kanalı",
                    value: "log",
                    description: "Silinen ve düzenlenen mesajları kaydeder"
                },
                {
                    label: "Giriş/Çıkış Kanalı",
                    value: "welcome",
                    description: "Üye giriş çıkış mesajlarını ayarlar"
                },
                {
                    label: "Öneri Kanalı",
                    value: "suggestion",
                    description: "Öneri kanalını ayarlar"
                },
                {
                    label: "Duyuru Kanalları",
                    value: "announcement",
                    description: "Duyuru ve sohbet kanallarını ayarlar"
                }
            );

        return interaction.reply({
            content: "Moderasyon sistemini seç.",
            components: [
                new ActionRowBuilder().addComponents(menu)
            ],
            ephemeral: true
        });
    }

    if (interaction.commandName === "basvuru") {
        if (!isAdmin(interaction.member)) {
            return interaction.reply({
                content: "Başvuru sistemini sadece Yönetici yetkisi olanlar kurabilir.",
                ephemeral: true
            });
        }

        applicationSetup.set(interaction.user.id, {
            guildId: interaction.guild.id
        });

        const modal = new ModalBuilder()
            .setCustomId("application_question_count")
            .setTitle("Başvuru Kurulumu");

        const count = new TextInputBuilder()
            .setCustomId("question_count")
            .setLabel("Kaç soru olsun? (1-5)")
            .setPlaceholder("Örn: 5")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(1);

        modal.addComponents(
            new ActionRowBuilder().addComponents(count)
        );

        return interaction.showModal(modal);
    }
      if (interaction.commandName === "cekilis") {
        if (!isAdmin(interaction.member)) {
            return interaction.reply({
                content: "Çekilişi sadece Yönetici başlatabilir.",
                ephemeral: true
            });
        }

        const duration = cleanDuration(
            interaction.options.getString("sure")
        );

        if (!duration || duration < 5000) {
            return interaction.reply({
                content: "Geçerli süre kullan. Örnek: 10m, 1h, 1d",
                ephemeral: true
            });
        }

        const winners = interaction.options.getInteger("kazanan_sayisi");
        const prize = interaction.options.getString("odul");

        const id = `${interaction.channel.id}-${Date.now()}`;

        const embed = new EmbedBuilder()
            .setTitle("🎉 ÇEKİLİŞ")
            .setDescription(
                `🎁 **Ödül:** ${prize}\n\n` +
                `👑 **Kazanan:** ${winners}\n` +
                `⏰ **Süre:** <t:${Math.floor((Date.now() + duration) / 1000)}:R>\n\n` +
                `Katılmak için aşağıdaki butona bas!`
            )
            .setFooter({
                text: "Bol şans!"
            });

        const button = new ButtonBuilder()
            .setCustomId(`raffle_join_${id}`)
            .setLabel("Çekilişe Katıl")
            .setEmoji("🎉")
            .setStyle(ButtonStyle.Primary);

        const message = await interaction.channel.send({
            embeds: [embed],
            components: [
                new ActionRowBuilder().addComponents(button)
            ]
        });

        data.raffles[id] = {
            channelId: interaction.channel.id,
            messageId: message.id,
            prize,
            winners,
            users: [],
            end: Date.now() + duration
        };

        save();

        await interaction.reply({
            content: "Çekiliş başlatıldı.",
            ephemeral: true
        });

        setTimeout(() => finishRaffle(interaction.guild.id, id), duration);

        return;
    }

    if (interaction.commandName === "drop") {
        if (!isAdmin(interaction.member)) {
            return interaction.reply({
                content: "Drop başlatmak için Yönetici yetkisi gerekir.",
                ephemeral: true
            });
        }

        if (data.drop) {
            return interaction.reply({
                content: "Zaten aktif bir drop var.",
                ephemeral: true
            });
        }

        const prize = interaction.options.getString("odul");

        const button = new ButtonBuilder()
            .setCustomId("drop_claim")
            .setLabel("Ödülü Al")
            .setEmoji("🎁")
            .setStyle(ButtonStyle.Success);

        await interaction.reply({
            content: `🎁 **DROP!**\n\nÖdül: **${prize}**\n\nİlk basan kazanır!`,
            components: [
                new ActionRowBuilder().addComponents(button)
            ]
        });

        const message = await interaction.fetchReply();

        data.drop = {
            channelId: interaction.channel.id,
            messageId: message.id,
            prize
        };

        save();

        return;
    }

    if (interaction.commandName === "duyuru") {
        if (!isAdmin(interaction.member)) {
            return interaction.reply({
                content: "Duyuru göndermek için Yönetici yetkisi gerekir.",
                ephemeral: true
            });
        }

        const message = interaction.options.getString("mesaj");

        if (!data.moderation.announcementChannel) {
            return interaction.reply({
                content: "Önce moderasyon menüsünden duyuru kanalını ayarla.",
                ephemeral: true
            });
        }

        const announcement = interaction.guild.channels.cache.get(
            data.moderation.announcementChannel
        );

        const chat = data.moderation.chatChannel
            ? interaction.guild.channels.cache.get(
                data.moderation.chatChannel
            )
            : null;

        if (!announcement) {
            return interaction.reply({
                content: "Duyuru kanalı bulunamadı.",
                ephemeral: true
            });
        }

        await announcement.send({
            content: "@everyone",
            embeds: [
                new EmbedBuilder()
                    .setTitle("📢 DUYURU")
                    .setDescription(message)
                    .setTimestamp()
            ],
            allowedMentions: {
                parse: ["everyone"]
            }
        });

        if (chat) {
            await chat.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("📢 Duyuru")
                        .setDescription(message)
                        .setTimestamp()
                ]
            });
        }

        return interaction.reply({
            content: "Duyuru gönderildi.",
            ephemeral: true
        });
    }

    if (interaction.commandName === "serverinfo") {
        const activeMembers = interaction.guild.members.cache.filter(
            member =>
                member.presence &&
                member.presence.status !== "offline"
        ).size;

        const embed = new EmbedBuilder()
            .setTitle(`📊 ${interaction.guild.name}`)
            .addFields(
                {
                    name: "👑 Sunucu Sahibi",
                    value: `<@${interaction.guild.ownerId}>`,
                    inline: true
                },
                {
                    name: "👥 Üye Sayısı",
                    value: `${interaction.guild.memberCount}`,
                    inline: true
                },
                {
                    name: "📚 Kanal Sayısı",
                    value: `${interaction.guild.channels.cache.size}`,
                    inline: true
                },
                {
                    name: "🟢 Aktif Üye",
                    value: `${activeMembers}`,
                    inline: true
                },
                {
                    name: "💬 Toplam Mesaj",
                    value: `${data.messageCount}`,
                    inline: true
                }
            )
            .setTimestamp();

        return interaction.reply({
            embeds: [embed]
        });
    }
      if (interaction.commandName === "klanekle") {
        if (!isAdmin(interaction.member)) {
            return interaction.reply({
                content: "Klan eklemek için Yönetici yetkisi gerekir.",
                ephemeral: true
            });
        }

        const clan = interaction.options.getString("klan").trim();

        if (data.clans.some(x => normalizeText(x) === normalizeText(clan))) {
            return interaction.reply({
                content: "Bu klan zaten eklenmiş.",
                ephemeral: true
            });
        }

        if (data.clans.length >= 25) {
            return interaction.reply({
                content: "En fazla 25 klan eklenebilir.",
                ephemeral: true
            });
        }

        data.clans.push(clan);
        save();

        return interaction.reply({
            content: `✅ **${clan}** klanı eklendi.`,
            ephemeral: true
        });
    }

    if (interaction.commandName === "klandel") {
        if (!isAdmin(interaction.member)) {
            return interaction.reply({
                content: "Klan silmek için Yönetici yetkisi gerekir.",
                ephemeral: true
            });
        }

        const clan = interaction.options.getString("klan");

        const index = data.clans.findIndex(
            x => normalizeText(x) === normalizeText(clan)
        );

        if (index === -1) {
            return interaction.reply({
                content: "Bu klan bulunamadı.",
                ephemeral: true
            });
        }

        const removed = data.clans.splice(index, 1)[0];

        if (data.clanVote) {
            delete data.clanVote.votes[removed];
        }

        save();

        return interaction.reply({
            content: `🗑️ **${removed}** klanı silindi.`,
            ephemeral: true
        });
    }

    if (interaction.commandName === "klanoyla") {
        if (!isAdmin(interaction.member)) {
            return interaction.reply({
                content: "Oylama başlatmak için Yönetici yetkisi gerekir.",
                ephemeral: true
            });
        }

        if (data.clanVote) {
            return interaction.reply({
                content: "Zaten aktif bir klandan oylama var.",
                ephemeral: true
            });
        }

        if (data.clans.length < 2) {
            return interaction.reply({
                content: "Oylama için en az 2 klan eklemelisin.",
                ephemeral: true
            });
        }

        data.clanVote = {
            channelId: interaction.channel.id,
            messageId: null,
            starterId: interaction.user.id,
            votes: {},
            users: {}
        };

        for (const clan of data.clans) {
            data.clanVote.votes[clan] = 0;
        }

        const message = await interaction.channel.send({
            embeds: [
                buildClanVoteEmbed(data)
            ],
            components: buildClanVoteButtons(data)
        });

        data.clanVote.messageId = message.id;
        save();

        return interaction.reply({
            content: "Klan oylaması başlatıldı.",
            ephemeral: true
        });
    }

    if (interaction.commandName === "klanbitir") {
        if (!isAdmin(interaction.member)) {
            return interaction.reply({
                content: "Oylamayı sadece Yönetici bitirebilir.",
                ephemeral: true
            });
        }

        if (!data.clanVote) {
            return interaction.reply({
                content: "Aktif bir klan oylaması yok.",
                ephemeral: true
            });
        }

        const winnerText = Object.entries(data.clanVote.votes)
            .sort((a, b) => b[1] - a[1])
            .map(([clan, votes]) => `**${clan}** — ${votes} oy`)
            .join("\n");

        const channel = interaction.guild.channels.cache.get(
            data.clanVote.channelId
        );

        if (channel) {
            await channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("🏆 KLAN OYLAMASI BİTTİ")
                        .setDescription(winnerText || "Oy kullanılmadı.")
                        .setTimestamp()
                ]
            });
        }

        data.clanVote = null;
        save();

        return interaction.reply({
            content: "Oylama bitirildi.",
            ephemeral: true
        });
    }
}

function buildClanVoteEmbed(data) {
    const text = Object.entries(data.clanVote.votes)
        .map(([clan, votes]) => `**${clan}** — ${votes} oy`)
        .join("\n");

    return new EmbedBuilder()
        .setTitle("⚔️ KLAN OYLAMASI")
        .setDescription(
            `${text}\n\nAşağıdaki butonlardan bir klan seç.\n` +
            `Her kullanıcı yalnızca **1 kez** oy kullanabilir.`
        )
        .setTimestamp();
}

function buildClanVoteButtons(data) {
    const rows = [];
    let row = new ActionRowBuilder();

    data.clans.forEach((clan, index) => {
        if (index > 0 && index % 5 === 0) {
            rows.push(row);
            row = new ActionRowBuilder();
        }

        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`clan_vote_${index}`)
                .setLabel(clan.slice(0, 80))
                .setStyle(ButtonStyle.Primary)
        );
    });

    if (row.components.length) {
        rows.push(row);
    }

    return rows.slice(0, 5);
}
async function handleStringSelect(interaction) {
    const data = guildData(interaction.guild.id);

    if (interaction.customId === "moderation_menu") {
        const value = interaction.values[0];

        if (value === "auto_role") {
            const menu = new RoleSelectMenuBuilder()
                .setCustomId("mod_auto_role")
                .setPlaceholder("Otomatik rolü seç");

            return interaction.update({
                content: "Yeni üyelerin alacağı rolü seç.",
                components: [
                    new ActionRowBuilder().addComponents(menu)
                ]
            });
        }

        if (value === "auto_reply") {
            const modal = new ModalBuilder()
                .setCustomId("mod_auto_reply")
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
                .setPlaceholder("as")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000);

            modal.addComponents(
                new ActionRowBuilder().addComponents(trigger),
                new ActionRowBuilder().addComponents(response)
            );

            return interaction.showModal(modal);
        }

        if (value === "profanity") {
            data.moderation.profanity =
                !data.moderation.profanity;

            save();

            return interaction.update({
                content:
                    `Küfür filtresi: **${
                        data.moderation.profanity
                            ? "AÇIK"
                            : "KAPALI"
                    }**`,
                components: []
            });
        }

        if (value === "link") {
            const menu = new ChannelSelectMenuBuilder()
                .setCustomId("mod_link_channels")
                .setPlaceholder("Link engellenecek kanalları seç")
                .setChannelTypes(ChannelType.GuildText)
                .setMinValues(1)
                .setMaxValues(10);

            return interaction.update({
                content: "Link engellemenin uygulanacağı kanalları seç.",
                components: [
                    new ActionRowBuilder().addComponents(menu)
                ]
            });
        }

        if (value === "log") {
            const menu = new ChannelSelectMenuBuilder()
                .setCustomId("mod_log_channel")
                .setPlaceholder("Log kanalını seç")
                .setChannelTypes(ChannelType.GuildText);

            return interaction.update({
                content: "Log kanalını seç.",
                components: [
                    new ActionRowBuilder().addComponents(menu)
                ]
            });
        }

        if (value === "welcome") {
            const menu = new ChannelSelectMenuBuilder()
                .setCustomId("mod_welcome_channel")
                .setPlaceholder("Giriş/çıkış kanalını seç")
                .setChannelTypes(ChannelType.GuildText);

            return interaction.update({
                content: "Giriş ve çıkış mesajlarının gönderileceği kanalı seç.",
                components: [
                    new ActionRowBuilder().addComponents(menu)
                ]
            });
        }

        if (value === "suggestion") {
            const menu = new ChannelSelectMenuBuilder()
                .setCustomId("mod_suggestion_channel")
                .setPlaceholder("Öneri kanalını seç")
                .setChannelTypes(ChannelType.GuildText);

            return interaction.update({
                content: "Sadece önerilerin yazılacağı kanalı seç.",
                components: [
                    new ActionRowBuilder().addComponents(menu)
                ]
            });
        }

        if (value === "announcement") {
            const menu = new ChannelSelectMenuBuilder()
                .setCustomId("mod_announcement_channels")
                .setPlaceholder("Duyuru kanalını seç")
                .setChannelTypes(ChannelType.GuildText)
                .setMinValues(1)
                .setMaxValues(2);

            return interaction.update({
                content:
                    "Önce 1. kanal olarak duyuru kanalını, 2. kanal olarak normal sohbet kanalını seçebilirsin.",
                components: [
                    new ActionRowBuilder().addComponents(menu)
                ]
            });
        }
    }
}

async function handleRoleSelect(interaction) {
    const data = guildData(interaction.guild.id);

    if (interaction.customId === "ticket_staff_role") {
        const setup = panelSetup.get(interaction.user.id);

        if (!setup) {
            return interaction.update({
                content: "Kurulum süresi doldu. `/panel` komutunu tekrar kullan.",
                components: []
            });
        }

        setup.staffRole = interaction.values[0];

        const menu = new ChannelSelectMenuBuilder()
            .setCustomId("ticket_category")
            .setPlaceholder("Ticket kategorisini seç")
            .setChannelTypes(ChannelType.GuildCategory);

        return interaction.update({
            content: "Şimdi ticket kategorisini seç.",
            components: [
                new ActionRowBuilder().addComponents(menu)
            ]
        });
    }

    if (interaction.customId === "application_role") {
        const setup = applicationSetup.get(interaction.user.id);

        if (!setup) {
            return interaction.update({
                content: "Başvuru kurulumu bulunamadı.",
                components: []
            });
        }

        data.applications.role = interaction.values[0];
        data.applications.questions = setup.questions;
        data.applications.panelChannel = interaction.channel.id;

        save();

        const button = new ButtonBuilder()
            .setCustomId("application_open")
            .setLabel("Başvuru Yap")
            .setEmoji("📋")
            .setStyle(ButtonStyle.Primary);

        await interaction.update({
            content: "Başvuru sistemi hazır.",
            components: []
        });

        await interaction.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle("📋 Yetkili Başvurusu")
                    .setDescription(
                        "Yetkili olmak için aşağıdaki butona basarak başvuru formunu doldurabilirsin."
                    )
            ],
            components: [
                new ActionRowBuilder().addComponents(button)
            ]
        });

        applicationSetup.delete(interaction.user.id);
    }
}
async function handleChannelSelect(interaction) {
    const data = guildData(interaction.guild.id);

    if (interaction.customId === "ticket_category") {
        const setup = panelSetup.get(interaction.user.id);

        if (!setup) {
            return interaction.update({
                content: "Kurulum süresi doldu. `/panel` komutunu tekrar kullan.",
                components: []
            });
        }

        setup.category = interaction.values[0];

        const modal = new ModalBuilder()
            .setCustomId("ticket_names_1")
            .setTitle("Ticket İsimleri 1/2");

        for (let i = 0; i < 3; i++) {
            const input = new TextInputBuilder()
                .setCustomId(`ticket_name_${i}`)
                .setLabel(`${i + 1}. Ticket adı`)
                .setPlaceholder(
                    setup.names[i] || data.ticket.names[i]
                )
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(80);

            modal.addComponents(
                new ActionRowBuilder().addComponents(input)
            );
        }

        return interaction.showModal(modal);
    }

    if (interaction.customId === "mod_link_channels") {
        data.moderation.linkChannels = interaction.values;
        save();

        return interaction.update({
            content: "✅ Link engelleme kanalları kaydedildi.",
            components: []
        });
    }

    if (interaction.customId === "mod_log_channel") {
        data.moderation.logChannel = interaction.values[0];
        save();

        return interaction.update({
            content: "✅ Log kanalı ayarlandı.",
            components: []
        });
    }

    if (interaction.customId === "mod_welcome_channel") {
        data.moderation.welcomeChannel = interaction.values[0];
        save();

        return interaction.update({
            content: "✅ Giriş/çıkış kanalı ayarlandı.",
            components: []
        });
    }

    if (interaction.customId === "mod_suggestion_channel") {
        data.moderation.suggestionChannel = interaction.values[0];
        save();

        return interaction.update({
            content: "✅ Öneri kanalı ayarlandı.",
            components: []
        });
    }

    if (interaction.customId === "mod_announcement_channels") {
        data.moderation.announcementChannel = interaction.values[0];

        if (interaction.values[1]) {
            data.moderation.chatChannel = interaction.values[1];
        }

        save();

        return interaction.update({
            content:
                "✅ Duyuru kanalı ayarlandı." +
                (interaction.values[1]
                    ? "\n✅ Sohbet kanalı da ayarlandı."
                    : ""),
            components: []
        });
    }
}

async function handleModal(interaction) {
    const data = guildData(interaction.guild.id);

    if (interaction.customId === "ticket_names_1") {
        const setup = panelSetup.get(interaction.user.id);

        if (!setup) {
            return interaction.reply({
                content: "Ticket kurulumu bulunamadı.",
                ephemeral: true
            });
        }

        setup.names[0] =
            interaction.fields.getTextInputValue("ticket_name_0");

        setup.names[1] =
            interaction.fields.getTextInputValue("ticket_name_1");

        setup.names[2] =
            interaction.fields.getTextInputValue("ticket_name_2");

        const modal = new ModalBuilder()
            .setCustomId("ticket_names_2")
            .setTitle("Ticket İsimleri 2/2");

        for (let i = 3; i < 6; i++) {
            const input = new TextInputBuilder()
                .setCustomId(`ticket_name_${i}`)
                .setLabel(`${i + 1}. Ticket adı`)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(80);

            modal.addComponents(
                new ActionRowBuilder().addComponents(input)
            );
        }

        return interaction.showModal(modal);
    }

    if (interaction.customId === "ticket_names_2") {
        const setup = panelSetup.get(interaction.user.id);

        if (!setup) {
            return interaction.reply({
                content: "Ticket kurulumu bulunamadı.",
                ephemeral: true
            });
        }

        for (let i = 3; i < 6; i++) {
            setup.names[i] =
                interaction.fields.getTextInputValue(
                    `ticket_name_${i}`
                );
        }

        data.ticket.staffRole = setup.staffRole;
        data.ticket.category = setup.category;
        data.ticket.names = setup.names;

        save();

        const menu = new StringSelectMenuBuilder()
            .setCustomId("ticket_open_menu")
            .setPlaceholder("Destek kategorisini seç")
            .addOptions(
                data.ticket.names.map((name, index) => ({
                    label: name,
                    value: String(index),
                    emoji: "🎫"
                }))
            );

        await interaction.reply({
            content: "✅ Ticket sistemi kuruldu.",
            ephemeral: true
        });

        await interaction.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle("🎫 Destek Merkezi")
                    .setDescription(
                        "Destek almak için aşağıdaki menüden uygun kategoriyi seç."
                    )
            ],
            components: [
                new ActionRowBuilder().addComponents(menu)
            ]
        });

        panelSetup.delete(interaction.user.id);
        return;
    }

    if (interaction.customId === "mod_auto_reply") {
        const trigger = interaction.fields
            .getTextInputValue("trigger")
            .trim();

        const response = interaction.fields
            .getTextInputValue("response")
            .trim();

        data.moderation.filteredWords[normalizeText(trigger)] =
            response;

        save();

        return interaction.reply({
            content:
                `✅ Otomatik cevap kaydedildi.\n\n` +
                `Tetikleyici: **${trigger}**\n` +
                `Cevap: **${response}**\n\n` +
                `Mesaj silinmeyecek.`,
            ephemeral: true
        });
    }

    if (interaction.customId === "application_question_count") {
        const count = Number(
            interaction.fields.getTextInputValue("question_count")
        );

        if (!Number.isInteger(count) || count < 1 || count > 5) {
            return interaction.reply({
                content: "Soru sayısı 1 ile 5 arasında olmalı.",
                ephemeral: true
            });
        }

        applicationSetup.set(interaction.user.id, {
            guildId: interaction.guild.id,
            questionCount: count
        });

        const modal = new ModalBuilder()
            .setCustomId("application_questions")
            .setTitle("Başvuru Soruları");

        for (let i = 0; i < count; i++) {
            const input = new TextInputBuilder()
                .setCustomId(`question_${i}`)
                .setLabel(`${i + 1}. soru`)
                .setPlaceholder(`${i + 1}. soru metnini yaz`)
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(200);

            modal.addComponents(
                new ActionRowBuilder().addComponents(input)
            );
        }

        return interaction.showModal(modal);
    }

    if (interaction.customId === "application_questions") {
        const setup = applicationSetup.get(interaction.user.id);

        if (!setup) {
            return interaction.reply({
                content: "Başvuru kurulumu bulunamadı.",
                ephemeral: true
            });
        }

        setup.questions = [];

        for (let i = 0; i < setup.questionCount; i++) {
            setup.questions.push(
                interaction.fields.getTextInputValue(
                    `question_${i}`
                )
            );
        }

        const menu = new RoleSelectMenuBuilder()
            .setCustomId("application_role")
            .setPlaceholder("Başvuru kabul edilince verilecek rolü seç");

        return interaction.reply({
            content: "Başvuru kabul edilince verilecek rolü seç.",
            components: [
                new ActionRowBuilder().addComponents(menu)
            ],
            ephemeral: true
        });
    }
}
async function handleButton(interaction) {
    const data = guildData(interaction.guild.id);

    if (interaction.customId.startsWith("ticket_claim_")) {
        const channel = interaction.channel;

        if (!isStaff(interaction.member, data)) {
            return interaction.reply({
                content: "Bu işlem için yetkin yok.",
                ephemeral: true
            });
        }

        if (getTicketClaimant(channel)) {
            return interaction.reply({
                content: "Bu ticket zaten başka bir yetkili tarafından alındı.",
                ephemeral: true
            });
        }

        const ownerId = getTicketOwner(channel);

        if (!ownerId) {
            return interaction.reply({
                content: "Ticket sahibi bulunamadı.",
                ephemeral: true
            });
        }

        const staffRole = interaction.guild.roles.cache.get(
            data.ticket.staffRole
        );

        if (staffRole) {
            await channel.permissionOverwrites.edit(
                staffRole,
                {
                    ViewChannel: true,
                    ReadMessageHistory: true,
                    SendMessages: false
                }
            );
        }

        await channel.permissionOverwrites.edit(
            interaction.user.id,
            {
                ViewChannel: true,
                ReadMessageHistory: true,
                SendMessages: true
            }
        );

        await channel.setTopic(
            `ticket-owner:${ownerId};ticket-claimed:${interaction.user.id}`
        );

        await interaction.reply({
            content: `🎫 Ticket **${interaction.user.tag}** tarafından alındı.`
        });

        return;
    }

    if (interaction.customId.startsWith("ticket_help_")) {
        if (!isStaff(interaction.member, data)) {
            return interaction.reply({
                content: "Bu işlem için yetkin yok.",
                ephemeral: true
            });
        }

        const staffRole = interaction.guild.roles.cache.get(
            data.ticket.staffRole
        );

        if (staffRole) {
            await interaction.channel.permissionOverwrites.edit(
                staffRole,
                {
                    ViewChannel: true,
                    ReadMessageHistory: true,
                    SendMessages: true
                }
            );
        }

        await interaction.reply({
            content: "🆘 Yardım istendi. Yetkililerin yazma izni tekrar açıldı."
        });

        return;
    }

    if (interaction.customId.startsWith("ticket_close_")) {
        if (!isStaff(interaction.member, data)) {
            return interaction.reply({
                content: "Ticket kapatmak için yetkin yok.",
                ephemeral: true
            });
        }

        const ownerId = getTicketOwner(interaction.channel);

        await interaction.reply({
            content: "🎫 Ticket kapatılıyor..."
        });

        const transcript = await createTranscript(
            interaction.channel
        );

        const owner = ownerId
            ? await interaction.guild.members.fetch(ownerId).catch(() => null)
            : null;

        const transcriptText =
            transcript || "Bu ticketta mesaj bulunamadı.";

        if (owner) {
            try {
                await owner.send({
                    content:
                        `🎫 **Ticket kapatıldı.**\n\n` +
                        `Sunucu: **${interaction.guild.name}**\n` +
                        `Kapatılan yetkili: **${interaction.user.tag}**\n\n` +
                        `Transcript:\n\`\`\`\n${truncate(transcriptText, 5000)}\n\`\`\``
                });
            } catch {}
        }

        const staffRole = data.ticket.staffRole
            ? interaction.guild.roles.cache.get(
                data.ticket.staffRole
            )
            : null;

        if (staffRole) {
            for (const member of staffRole.members.values()) {
                try {
                    await member.send({
                        content:
                            `🎫 **Ticket kapatıldı.**\n` +
                            `Sunucu: **${interaction.guild.name}**\n` +
                            `Ticket sahibi: **${owner?.user?.tag || "Bilinmiyor"}**\n` +
                            `Kapatılan yetkili: **${interaction.user.tag}**\n\n` +
                            `Transcript:\n\`\`\`\n${truncate(transcriptText, 5000)}\n\`\`\``
                    });
                } catch {}
            }
        }

        await sendLog(
            interaction.guild,
            new EmbedBuilder()
                .setTitle("🎫 Ticket Kapatıldı")
                .addFields(
                    {
                        name: "Ticket Sahibi",
                        value: owner
                            ? owner.user.tag
                            : "Bilinmiyor"
                    },
                    {
                        name: "Kapatan",
                        value: interaction.user.tag
                    },
                    {
                        name: "Kanal",
                        value: interaction.channel.name
                    }
                )
                .setTimestamp()
        );

        setTimeout(() => {
            interaction.channel.delete().catch(() => {});
        }, 1500);

        return;
    }

    if (interaction.customId.startsWith("raffle_join_")) {
        const id = interaction.customId.replace(
            "raffle_join_",
            ""
        );

        const raffle = data.raffles[id];

        if (!raffle) {
            return interaction.reply({
                content: "Bu çekiliş artık aktif değil.",
                ephemeral: true
            });
        }

        if (raffle.users.includes(interaction.user.id)) {
            return interaction.reply({
                content: "Zaten çekilişe katıldın.",
                ephemeral: true
            });
        }

        raffle.users.push(interaction.user.id);
        save();

        return interaction.reply({
            content: "🎉 Çekilişe katıldın!",
            ephemeral: true
        });
    }

    if (interaction.customId === "drop_claim") {
        if (!data.drop) {
            return interaction.reply({
                content: "Bu drop zaten alınmış.",
                ephemeral: true
            });
        }

        const prize = data.drop.prize;

        data.drop = null;
        save();

        await interaction.update({
            content:
                `🎁 **DROP KAZANILDI!**\n\n` +
                `Kazanan: **${interaction.user.tag}**\n` +
                `Ödül: **${prize}**`,
            components: []
        });

        return;
    }

    if (interaction.customId === "application_open") {
        if (
            !data.applications.questions.length ||
            !data.applications.role
        ) {
            return interaction.reply({
                content: "Başvuru sistemi henüz tam kurulmamış.",
                ephemeral: true
            });
        }

        const modal = new ModalBuilder()
            .setCustomId("application_submit")
            .setTitle("Yetkili Başvurusu");

        data.applications.questions.forEach((question, index) => {
            const input = new TextInputBuilder()
                .setCustomId(`answer_${index}`)
                .setLabel(question.slice(0, 45))
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000);

            modal.addComponents(
                new ActionRowBuilder().addComponents(input)
            );
        });

        return interaction.showModal(modal);
    }

    if (
        interaction.customId === "application_accept" ||
        interaction.customId === "application_reject"
    ) {
        if (interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({
                content: "Başvuruları sadece sunucu sahibi kabul veya reddedebilir.",
                ephemeral: true
            });
        }

        const customId = interaction.message.embeds[0]?.footer?.text;

        if (!customId || !customId.startsWith("APP:")) {
            return interaction.reply({
                content: "Başvuru bilgisi bulunamadı.",
                ephemeral: true
            });
        }

        const applicantId = customId.replace("APP:", "");

        const applicant =
            await interaction.guild.members
                .fetch(applicantId)
                .catch(() => null);

        if (!applicant) {
            return interaction.reply({
                content: "Başvuru sahibi artık sunucuda değil.",
                ephemeral: true
            });
        }

        if (interaction.customId === "application_accept") {
            const role = data.applications.role
                ? interaction.guild.roles.cache.get(
                    data.applications.role
                )
                : null;

            if (role) {
                await applicant.roles.add(role).catch(() => {});
            }

            await interaction.update({
                embeds: [
                    EmbedBuilder.from(interaction.message.embeds[0])
                        .setColor(0x2ecc71)
                        .setTitle("📋 Başvuru Kabul Edildi")
                ],
                components: []
            });

            try {
                await applicant.send(
                    `✅ **${interaction.guild.name}** sunucusundaki yetkili başvurun kabul edildi.`
                );
            } catch {}

            return;
        }

        await interaction.update({
            embeds: [
                EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor(0xe74c3c)
                    .setTitle("📋 Başvuru Reddedildi")
            ],
            components: []
        });

        try {
            await applicant.send(
                `❌ **${interaction.guild.name}** sunucusundaki yetkili başvurun reddedildi.`
            );
        } catch {}

        return;
    }

    if (interaction.customId.startsWith("clan_vote_")) {
        if (!data.clanVote) {
            return interaction.reply({
                content: "Aktif oylama yok.",
                ephemeral: true
            });
        }

        if (data.clanVote.users[interaction.user.id]) {
            return interaction.reply({
                content: "Daha önce oy kullandın. Oyunu değiştiremezsin.",
                ephemeral: true
            });
        }

        const index = Number(
            interaction.customId.replace("clan_vote_", "")
        );

        const clan = data.clans[index];

        if (!clan || data.clanVote.votes[clan] === undefined) {
            return interaction.reply({
                content: "Bu klan artık oylamada değil.",
                ephemeral: true
            });
        }

        data.clanVote.votes[clan]++;
        data.clanVote.users[interaction.user.id] = clan;

        save();

        await interaction.update({
            embeds: [
                buildClanVoteEmbed(data)
            ],
            components: buildClanVoteButtons(data)
        });

        return;
    }
}
client.on("messageCreate", async message => {
    if (!message.guild) return;
    if (message.author.bot) return;

    const data = guildData(message.guild.id);

    data.messageCount++;
    save();

    const content = message.content.trim();
    const normalized = normalizeText(content);

    if (content === "!serverinfo") {
        const activeMembers = message.guild.members.cache.filter(
            member =>
                member.presence &&
                member.presence.status !== "offline"
        ).size;

        const embed = new EmbedBuilder()
            .setTitle(`📊 ${message.guild.name}`)
            .addFields(
                {
                    name: "👑 Sunucu Sahibi",
                    value: `<@${message.guild.ownerId}>`,
                    inline: true
                },
                {
                    name: "👥 Üye Sayısı",
                    value: `${message.guild.memberCount}`,
                    inline: true
                },
                {
                    name: "📚 Kanal Sayısı",
                    value: `${message.guild.channels.cache.size}`,
                    inline: true
                },
                {
                    name: "🟢 Aktif Üye",
                    value: `${activeMembers}`,
                    inline: true
                },
                {
                    name: "💬 Toplam Mesaj",
                    value: `${data.messageCount}`,
                    inline: true
                }
            )
            .setTimestamp();

        await message.reply({
            embeds: [embed]
        });

        return;
    }

    if (content === "k!lock") {
        if (!isStaff(message.member, data)) return;

        await message.channel.permissionOverwrites.edit(
            message.guild.roles.everyone,
            {
                SendMessages: false
            }
        );

        await message.reply("🔒 Kanal kilitlendi.");
        return;
    }

    if (content === "k!unlock") {
        if (!isStaff(message.member, data)) return;

        await message.channel.permissionOverwrites.edit(
            message.guild.roles.everyone,
            {
                SendMessages: null
            }
        );

        await message.reply("🔓 Kanalın kilidi açıldı.");
        return;
    }

    if (
        content === "k!sıfırla" ||
        content === "k!sifirla"
    ) {
        if (!isStaff(message.member, data)) return;

        const fetched = await message.channel.messages.fetch({
            limit: 100
        });

        await message.channel.bulkDelete(
            fetched,
            true
        ).catch(() => {});

        const msg = await message.channel.send(
            "✅ Kanal başarıyla sıfırlandı."
        );

        setTimeout(() => {
            msg.delete().catch(() => {});
        }, 5000);

        return;
    }

    if (
        data.moderation.suggestionChannel ===
        message.channel.id
    ) {
        if (!content.toLocaleLowerCase("tr-TR").startsWith("öneri:")) {
            await message.delete().catch(() => {});

            const warning = await message.channel.send(
                `${message.author}, bu kanal sadece önerilere açıktır. Önerini **Öneri:** şeklinde yaz.`
            );

            setTimeout(() => {
                warning.delete().catch(() => {});
            }, 3000);

            return;
        }
    }

    if (
        data.moderation.links &&
        data.moderation.linkChannels.includes(
            message.channel.id
        ) &&
        !isStaff(message.member, data)
    ) {
        const linkRegex =
            /(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)/i;

        if (linkRegex.test(message.content)) {
            await message.delete().catch(() => {});

            const warning = await message.channel.send(
                `${message.author}, bu kanalda link paylaşamazsın.`
            );

            setTimeout(() => {
                warning.delete().catch(() => {});
            }, 3000);

            return;
        }
    }

    if (
        data.moderation.profanity &&
        !isStaff(message.member, data) &&
        containsProfanity(message.content)
    ) {
        await message.delete().catch(() => {});

        const warning = await message.channel.send(
            `${message.author}, bu sunucuda küfür kullanamazsın.`
        );

        setTimeout(() => {
            warning.delete().catch(() => {});
        }, 3000);

        await sendLog(
            message.guild,
            new EmbedBuilder()
                .setTitle("🚫 Küfür Filtresi")
                .addFields(
                    {
                        name: "Kullanıcı",
                        value: message.author.tag
                    },
                    {
                        name: "Kanal",
                        value: message.channel.toString()
                    },
                    {
                        name: "Mesaj",
                        value: truncate(message.content, 1000)
                    }
                )
                .setTimestamp()
        );

        return;
    }

    const customResponse =
        data.moderation.filteredWords[normalized];

    if (customResponse) {
        await message.channel.send({
            content: customResponse
        });

        return;
    }

    if (content.startsWith("!")) return;

    const botMention = `<@${client.user.id}>`;

    if (message.content.startsWith(botMention)) {
        return;
    }
});

client.on("messageDelete", async message => {
    if (!message.guild) return;
    if (message.author?.bot) return;

    await sendLog(
        message.guild,
        new EmbedBuilder()
            .setTitle("🗑️ Mesaj Silindi")
            .addFields(
                {
                    name: "Kullanıcı",
                    value: message.author
                        ? message.author.tag
                        : "Bilinmiyor"
                },
                {
                    name: "Kanal",
                    value: message.channel
                        ? message.channel.toString()
                        : "Bilinmiyor"
                },
                {
                    name: "Mesaj",
                    value: truncate(
                        message.content || "İçerik yok",
                        1000
                    )
                }
            )
            .setTimestamp()
    );
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
    if (!oldMessage.guild) return;
    if (oldMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;

    await sendLog(
        oldMessage.guild,
        new EmbedBuilder()
            .setTitle("✏️ Mesaj Düzenlendi")
            .addFields(
                {
                    name: "Kullanıcı",
                    value: oldMessage.author
                        ? oldMessage.author.tag
                        : "Bilinmiyor"
                },
                {
                    name: "Kanal",
                    value: oldMessage.channel.toString()
                },
                {
                    name: "Eski Mesaj",
                    value: truncate(
                        oldMessage.content || "Boş",
                        1000
                    )
                },
                {
                    name: "Yeni Mesaj",
                    value: truncate(
                        newMessage.content || "Boş",
                        1000
                    )
                }
            )
            .setTimestamp()
    );
});

client.on("guildMemberAdd", async member => {
    const data = guildData(member.guild.id);

    if (data.moderation.autoRole) {
        const role = member.guild.roles.cache.get(
            data.moderation.autoRole
        );

        if (role) {
            await member.roles.add(role).catch(() => {});
        }
    }

    if (!data.moderation.welcomeChannel) return;

    const channel = member.guild.channels.cache.get(
        data.moderation.welcomeChannel
    );

    if (!channel) return;

    const accountAge =
        Date.now() - member.user.createdTimestamp;

    const days = Math.floor(
        accountAge / 86400000
    );

    let trust = "Normal";

    if (days < 7) trust = "Düşük";
    else if (days < 30) trust = "Orta";

    await channel.send({
        embeds: [
            new EmbedBuilder()
                .setTitle("👋 Yeni Üye Katıldı")
                .setDescription(
                    `${member} sunucuya katıldı.`
                )
                .addFields(
                    {
                        name: "👤 Kullanıcı",
                        value: member.user.tag
                    },
                    {
                        name: "📅 Hesap Tarihi",
                        value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F>`
                    },
                    {
                        name: "⏱️ Hesap Yaşı",
                        value: `${days} gün`
                    },
                    {
                        name: "🛡️ Güven Durumu",
                        value: trust
                    },
                    {
                        name: "🕐 Katılma Zamanı",
                        value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
                    }
                )
                .setThumbnail(member.user.displayAvatarURL())
                .setTimestamp()
        ]
    });
});
client.on("guildMemberRemove", async member => {
    const data = guildData(member.guild.id);

    if (!data.moderation.welcomeChannel) return;

    const channel = member.guild.channels.cache.get(
        data.moderation.welcomeChannel
    );

    if (!channel) return;

    await channel.send({
        embeds: [
            new EmbedBuilder()
                .setTitle("👋 Üye Ayrıldı")
                .setDescription(
                    `**${member.user.tag}** sunucudan ayrıldı.`
                )
                .addFields({
                    name: "📅 Hesap Tarihi",
                    value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F>`
                })
                .setThumbnail(
                    member.user.displayAvatarURL()
                )
                .setTimestamp()
        ]
    });
});

async function finishRaffle(guildId, id) {
    const data = guildData(guildId);
    const raffle = data.raffles[id];

    if (!raffle) return;

    const guild = client.guilds.cache.get(guildId);

    if (!guild) return;

    const channel = guild.channels.cache.get(
        raffle.channelId
    );

    if (!channel) {
        delete data.raffles[id];
        save();
        return;
    }

    const message = await channel.messages
        .fetch(raffle.messageId)
        .catch(() => null);

    if (!message) {
        delete data.raffles[id];
        save();
        return;
    }

    const users = [...new Set(raffle.users)];

    if (!users.length) {
        await message.edit({
            embeds: [
                new EmbedBuilder()
                    .setTitle("🎉 ÇEKİLİŞ BİTTİ")
                    .setDescription(
                        `🎁 Ödül: **${raffle.prize}**\n\nKatılım olmadığı için kazanan çıkmadı.`
                    )
            ],
            components: []
        });

        delete data.raffles[id];
        save();
        return;
    }

    const shuffled = [...users].sort(
        () => Math.random() - 0.5
    );

    const winners = shuffled.slice(
        0,
        Math.min(raffle.winners, shuffled.length)
    );

    const mentions = winners
        .map(id => `<@${id}>`)
        .join(", ");

    await message.edit({
        embeds: [
            new EmbedBuilder()
                .setTitle("🎉 ÇEKİLİŞ BİTTİ")
                .setDescription(
                    `🎁 **Ödül:** ${raffle.prize}\n\n` +
                    `🏆 **Kazananlar:** ${mentions}`
                )
                .setTimestamp()
        ],
        components: []
    });

    await channel.send(
        `🎉 Tebrikler ${mentions}! **${raffle.prize}** kazandınız!`
    );

    delete data.raffles[id];
    save();
}

client.on("error", error => {
    console.error("Discord Client Hatası:", error);
});

process.on("unhandledRejection", error => {
    console.error("Unhandled Rejection:", error);
});

process.on("uncaughtException", error => {
    console.error("Uncaught Exception:", error);
});

const token = process.env.DISCORD_TOKEN;

if (!token) {
    console.error("DISCORD_TOKEN bulunamadı.");
    process.exit(1);
}

client.login(token);
