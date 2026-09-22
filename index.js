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
  EmbedBuilder,
  AttachmentBuilder,
  SlashCommandBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message]
});

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "database.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let db = {};

if (fs.existsSync(DATA_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    db = {};
  }
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
        role: null
      },
      clans: [],
      clanVote: null,
      messageCount: 0,
      raffle: {},
      drop: null
    };
    save();
  }

  return db[guildId];
}

function isStaff(member, guild) {
  const data = guildData(guild.id);
  return member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    (data.ticket.staffRole && member.roles.cache.has(data.ticket.staffRole));
}

function cleanName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ\s-]/gi, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80) || "ticket";
}

function duration(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  const out = [];
  if (d) out.push(`${d}g`);
  if (h) out.push(`${h}s`);
  if (m) out.push(`${m}dk`);
  if (sec || !out.length) out.push(`${sec}sn`);

  return out.join(" ");
}

function parseDuration(input) {
  const match = String(input).toLowerCase().match(/^(\d+)\s*(s|sn|m|dk|h|sa|d|g)$/);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2];

  const multipliers = {
    s: 1000,
    sn: 1000,
    m: 60000,
    dk: 60000,
    h: 3600000,
    sa: 3600000,
    d: 86400000,
    g: 86400000
  };

  return value * multipliers[unit];
}

async function sendLog(guild, embed) {
  const data = guildData(guild.id);
  if (!data.moderation.logChannel) return;

  const channel = guild.channels.cache.get(data.moderation.logChannel);
  if (!channel) return;

  try {
    await channel.send({ embeds: [embed] });
  } catch {}
}

function ticketButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("ticket_open_0").setLabel("Genel Destek").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("ticket_open_1").setLabel("Teknik Destek").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("ticket_open_2").setLabel("Oyuncu Destek").setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("ticket_open_3").setLabel("Yetkili Destek").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("ticket_open_4").setLabel("Satın Alma").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("ticket_open_5").setLabel("Diğer").setStyle(ButtonStyle.Secondary)
    )
  ];
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("panel")
      .setDescription("Ticket panelini kurar"),

    new SlashCommandBuilder()
      .setName("moderasyon")
      .setDescription("Moderasyon sistemini ayarlar"),

    new SlashCommandBuilder()
      .setName("çekiliş")
      .setDescription("Çekiliş başlatır")
      .addStringOption(o =>
        o.setName("süre").setDescription("Örnek: 10m, 1h, 1d").setRequired(true)
      )
      .addIntegerOption(o =>
        o.setName("kazanan_sayısı").setDescription("Kazanan sayısı").setRequired(true).setMinValue(1).setMaxValue(50)
      )
      .addStringOption(o =>
        o.setName("ödül").setDescription("Çekiliş ödülü").setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("drop")
      .setDescription("Drop başlatır")
      .addStringOption(o =>
        o.setName("ödül").setDescription("Drop ödülü").setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("başvuru")
      .setDescription("Başvuru sistemini kurar"),

    new SlashCommandBuilder()
      .setName("duyuru")
      .setDescription("Duyuru gönderir")
      .addStringOption(o =>
        o.setName("mesaj").setDescription("Duyuru mesajı").setRequired(true)
      )
      .addBooleanOption(o =>
        o.setName("ping").setDescription("Everyone/Here ping gönderilsin mi?").setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("klanoyla")
      .setDescription("Klan oylaması başlatır"),

    new SlashCommandBuilder()
      .setName("klanekle")
      .setDescription("Oylamaya klan ekler")
      .addStringOption(o =>
        o.setName("klan").setDescription("Klan adı").setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("klanbitir")
      .setDescription("Klan oylamasını bitirir"),

    new SlashCommandBuilder()
      .setName("klandel")
      .setDescription("Klanı oylamadan kaldırır")
      .addStringOption(o =>
        o.setName("klan").setDescription("Klan adı").setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("serverinfo")
      .setDescription("Sunucu bilgilerini gösterir")
  ];

  await client.application.commands.set(commands);
}

client.once("ready", async () => {
  await registerCommands();
  console.log(`${client.user.tag} aktif.`);
});

client.on("guildCreate", guild => {
  guildData(guild.id);
});

client.on("guildMemberAdd", async member => {
  const data = guildData(member.guild.id);

  if (data.moderation.autoRole) {
    const role = member.guild.roles.cache.get(data.moderation.autoRole);
    if (role) {
      try {
        await member.roles.add(role);
      } catch {}
    }
  }

  if (!data.moderation.welcomeChannel) return;

  const channel = member.guild.channels.cache.get(data.moderation.welcomeChannel);
  if (!channel) return;

  const created = member.user.createdTimestamp;
  const age = Date.now() - created;

  const embed = new EmbedBuilder()
    .setTitle("👋 Yeni Üye")
    .setDescription(`${member} sunucuya katıldı.`)
    .addFields(
      { name: "Üye", value: `${member.user.tag}`, inline: true },
      { name: "Giriş Zamanı", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
      { name: "Hesap Tarihi", value: `<t:${Math.floor(created / 1000)}:F>`, inline: false },
      { name: "Güvenilirlik", value: age >= 2592000000 ? "Güvenilir" : "Yeni hesap", inline: true },
      { name: "Hesap Yaşı", value: duration(age), inline: true }
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setTimestamp();

  await channel.send({ embeds: [embed] });
});

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;

  const data = guildData(message.guild.id);
  data.messageCount++;
  save();

  if (
    data.moderation.suggestionChannel &&
    message.channel.id === data.moderation.suggestionChannel
  ) {
    const content = message.content.trim();

    if (
      !content.startsWith("öneri:") &&
      !content.startsWith("öneri ") &&
      !content.startsWith("Öneri:") &&
      !content.startsWith("Öneri ")
    ) {
      try {
        await message.delete();
        const warn = await message.channel.send(
          `${message.author}, bu kanal sadece önerilere açıktır.`
        );
        setTimeout(() => warn.delete().catch(() => {}), 3000);
      } catch {}
      return;
    }
  }

  if (
    data.moderation.linkChannels.includes(message.channel.id) &&
    !isStaff(message.member, message.guild)
  ) {
    const linkRegex = /(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)/i;

    if (linkRegex.test(message.content)) {
      try {
        await message.delete();

        const warn = await message.channel.send(
          `${message.author}, bu kanalda link paylaşamazsın.`
        );

        setTimeout(() => warn.delete().catch(() => {}), 3000);

        await sendLog(
          message.guild,
          new EmbedBuilder()
            .setTitle("🔗 Link Engellendi")
            .setColor(0xff0000)
            .addFields(
              { name: "Üye", value: `${message.author.tag}`, inline: true },
              { name: "Kanal", value: `${message.channel}`, inline: true },
              { name: "Mesaj", value: message.content.slice(0, 1000) || "Bilinmiyor" }
            )
            .setTimestamp()
        );
      } catch {}

      return;
    }
  }

  const lower = message.content.toLowerCase();

  for (const [word, response] of Object.entries(data.moderation.filteredWords)) {
    if (lower.includes(word.toLowerCase())) {
      try {
        await message.delete();
        await message.channel.send({
          content: response
        });
      } catch {}
      break;
    }
  }

  const prefix = "k!";

  if (!lower.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  if (!["lock", "unlock", "sıfırla", "sifirla"].includes(command)) return;

  if (!isStaff(message.member, message.guild)) {
    return message.reply("Bu komutu kullanmak için yetkin yok.");
  }

  if (command === "lock") {
    try {
      await message.channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        { SendMessages: false }
      );

      await message.reply("🔒 Kanal kilitlendi.");
    } catch {
      await message.reply("Kanal kilitlenemedi.");
    }
  }

  if (command === "unlock") {
    try {
      await message.channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        { SendMessages: null }
      );

      await message.reply("🔓 Kanalın kilidi açıldı.");
    } catch {
      await message.reply("Kanalın kilidi açılamadı.");
    }
  }

  if (command === "sıfırla" || command === "sifirla") {
    try {
      const messages = await message.channel.messages.fetch({ limit: 100 });
      await message.channel.bulkDelete(messages, true);
      await message.channel.send("✅ Kanal başarıyla sıfırlandı.");
    } catch {
      await message.reply("Kanal sıfırlanamadı. Eski mesajlar Discord tarafından silinemiyor olabilir.");
    }
  }
});

client.on("messageDelete", async message => {
  if (!message.guild || message.author?.bot) return;

  await sendLog(
    message.guild,
    new EmbedBuilder()
      .setTitle("🗑️ Mesaj Silindi")
      .setColor(0xff3333)
      .addFields(
        { name: "Üye", value: message.author ? `${message.author.tag}` : "Bilinmiyor", inline: true },
        { name: "Kanal", value: `${message.channel}`, inline: true },
        { name: "Mesaj", value: message.content?.slice(0, 1000) || "Mesaj içeriği alınamadı." }
      )
      .setTimestamp()
  );
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;

  await sendLog(
    newMessage.guild,
    new EmbedBuilder()
      .setTitle("✏️ Mesaj Düzenlendi")
      .setColor(0xffaa00)
      .addFields(
        { name: "Üye", value: `${newMessage.author.tag}`, inline: true },
        { name: "Kanal", value: `${newMessage.channel}`, inline: true },
        { name: "Eski Mesaj", value: oldMessage.content?.slice(0, 900) || "Bilinmiyor" },
        { name: "Yeni Mesaj", value: newMessage.content?.slice(0, 900) || "Bilinmiyor" }
      )
      .setTimestamp()
  );
});
async function openTicket(interaction, index) {
  const guild = interaction.guild;
  const user = interaction.user;
  const data = guildData(guild.id);

  const existing = guild.channels.cache.find(
    c =>
      c.topic === `ticket-owner:${user.id}` &&
      c.type === ChannelType.GuildText
  );

  if (existing) {
    return interaction.reply({
      content: `Zaten açık bir ticketin var: ${existing}`,
      ephemeral: true
    });
  }

  if (!data.ticket.staffRole || !data.ticket.category) {
    return interaction.reply({
      content: "Ticket sistemi henüz yapılandırılmamış.",
      ephemeral: true
    });
  }

  const category = guild.channels.cache.get(data.ticket.category);
  const staffRole = guild.roles.cache.get(data.ticket.staffRole);

  if (!category || !staffRole) {
    return interaction.reply({
      content: "Ticket sistemi için seçilen rol veya kategori artık bulunamıyor.",
      ephemeral: true
    });
  }

  const ticketName = cleanName(
    `${data.ticket.names[index] || "Ticket"}-${user.username}`
  );

  const channel = await guild.channels.create({
    name: ticketName,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `ticket-owner:${user.id}`,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: user.id,
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
          PermissionsBitField.Flags.ReadMessageHistory
        ],
        deny: [PermissionsBitField.Flags.SendMessages]
      }
    ]
  });

  const embed = new EmbedBuilder()
    .setTitle(`🎫 ${data.ticket.names[index] || "Ticket"}`)
    .setDescription(
      `Hoş geldin ${user}.\n\n` +
      `Bir yetkili ticketini sahiplenecektir.\n` +
      `Ticket sahiplenildikten sonra yalnızca sahiplenen yetkili yazabilir.\n\n` +
      `Yetkili cevap veremiyorsa **Yardım İste** butonunu kullanabilir.`
    )
    .setColor(0x7c3aed)
    .setTimestamp();

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_claim")
      .setLabel("Ticketi Sahiplen")
      .setEmoji("🙋")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("ticket_help")
      .setLabel("Yardım İste")
      .setEmoji("🆘")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("Ticketi Kapat")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: `${user} <@&${staffRole.id}>`,
    embeds: [embed],
    components: [buttons]
  });

  await interaction.reply({
    content: `✅ Ticketin oluşturuldu: ${channel}`,
    ephemeral: true
  });
}

async function createTranscript(channel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted = [...messages.values()].reverse();

  let html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Ticket Transcript</title>
<style>
body{font-family:Arial;background:#111;color:#eee;padding:30px}
.message{padding:12px;margin:8px 0;background:#1c1c1c;border-radius:8px}
.author{font-weight:bold;color:#9b7cff}
.time{color:#888;font-size:12px}
.content{margin-top:5px;white-space:pre-wrap}
</style>
</head>
<body>
<h1>Ticket Transcript</h1>
<h3>${channel.guild.name} / ${channel.name}</h3>
`;

  for (const message of sorted) {
    html += `
<div class="message">
<div class="author">${escapeHtml(message.author?.tag || "Bilinmeyen")}</div>
<div class="time">${new Date(message.createdTimestamp).toLocaleString()}</div>
<div class="content">${escapeHtml(message.content || "[Medya / Embed / Dosya]")}</div>
</div>
`;
  }

  html += `
</body>
</html>
`;

  return Buffer.from(html, "utf8");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function closeTicket(interaction) {
  const guild = interaction.guild;
  const member = interaction.member;
  const data = guildData(guild.id);

  if (!isStaff(member, guild)) {
    return interaction.reply({
      content: "Bu ticketi kapatmak için yetkin yok.",
      ephemeral: true
    });
  }

  const ownerMatch = interaction.channel.topic?.match(/^ticket-owner:(\d+)$/);
  const ownerId = ownerMatch?.[1];

  await interaction.reply({
    content: "🔒 Ticket kapatılıyor ve transcript hazırlanıyor..."
  });

  let transcript;

  try {
    transcript = await createTranscript(interaction.channel);
  } catch {
    transcript = Buffer.from("Transcript oluşturulamadı.", "utf8");
  }

  const file = new AttachmentBuilder(transcript, {
    name: `${interaction.channel.name}-transcript.html`
  });

  if (ownerId) {
    try {
      const owner = await client.users.fetch(ownerId);

      await owner.send({
        content: `📄 **${guild.name}** sunucusundaki ticket transcriptin:`,
        files: [file]
      });
    } catch {}
  }

  const staffRole = data.ticket.staffRole
    ? guild.roles.cache.get(data.ticket.staffRole)
    : null;

  if (staffRole) {
    for (const [, staff] of staffRole.members) {
      try {
        await staff.send({
          content: `📄 **${guild.name}** sunucusundaki kapatılan ticket transcripti:`,
          files: [new AttachmentBuilder(transcript, {
            name: `${interaction.channel.name}-transcript.html`
          })]
        });
      } catch {}
    }
  }

  await sendLog(
    guild,
    new EmbedBuilder()
      .setTitle("🔒 Ticket Kapatıldı")
      .setColor(0xff3333)
      .addFields(
        { name: "Kanal", value: interaction.channel.name, inline: true },
        { name: "Kapatan", value: interaction.user.tag, inline: true },
        { name: "Sahip", value: ownerId ? `<@${ownerId}>` : "Bilinmiyor", inline: true }
      )
      .setTimestamp()
  );

  setTimeout(() => {
    interaction.channel.delete().catch(() => {});
  }, 1500);
}
async function configurePanel(interaction) {
  const data = guildData(interaction.guild.id);

  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return interaction.reply({
      content: "Bu sistemi ayarlamak için Sunucuyu Yönet yetkisine sahip olmalısın.",
      ephemeral: true
    });
  }

  const embed = new EmbedBuilder()
    .setTitle("🎫 Ticket Panel Kurulumu")
    .setDescription("Önce ticketlerde görev yapacak yetkili rolünü seç.")
    .setColor(0x7c3aed);

  const row = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId("panel_staff_role")
      .setPlaceholder("Yetkili rolünü seç")
      .setMinValues(1)
      .setMaxValues(1)
  );

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true
  });
}

async function moderationMenu(interaction) {
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return interaction.reply({
      content: "Bu sistemi ayarlamak için Sunucuyu Yönet yetkisine sahip olmalısın.",
      ephemeral: true
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("moderation_menu")
      .setPlaceholder("Bir ayar seç")
      .addOptions(
        { label: "Otorol", value: "autorole", emoji: "👤" },
        { label: "Kelime → Cevap", value: "keyword", emoji: "💬" },
        { label: "Küfür Filtresi", value: "profanity", emoji: "🚫" },
        { label: "Link Engelleme", value: "links", emoji: "🔗" },
        { label: "Duyuru Kanalları", value: "announcement", emoji: "📢" },
        { label: "Log Kanalı", value: "log", emoji: "📋" },
        { label: "Giriş / Çıkış", value: "welcome", emoji: "👋" },
        { label: "Öneri Kanalı", value: "suggestion", emoji: "💡" }
      )
  );

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("🛡️ Moderasyon Ayarları")
        .setDescription("Aşağıdaki menüden değiştirmek istediğin sistemi seç.")
        .setColor(0x7c3aed)
    ],
    components: [row],
    ephemeral: true
  });
}

async function applicationSetup(interaction) {
  if (interaction.guild.ownerId !== interaction.user.id) {
    return interaction.reply({
      content: "Başvuru sistemini yalnızca sunucu sahibi ayarlayabilir.",
      ephemeral: true
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("application_question_count")
      .setPlaceholder("Soru sayısını seç")
      .addOptions(
        { label: "1 Soru", value: "1" },
        { label: "2 Soru", value: "2" },
        { label: "3 Soru", value: "3" },
        { label: "4 Soru", value: "4" },
        { label: "5 Soru", value: "5" },
        { label: "6 Soru", value: "6" },
        { label: "7 Soru", value: "7" },
        { label: "8 Soru", value: "8" },
        { label: "9 Soru", value: "9" },
        { label: "10 Soru", value: "10" }
      )
  );

  await interaction.reply({
    content: "Başvuru için soru sayısını seç.",
    components: [row],
    ephemeral: true
  });
}

async function sendApplicationPanel(interaction) {
  const data = guildData(interaction.guild.id);

  if (!data.applications.questions.length || !data.applications.role) {
    return interaction.reply({
      content: "Önce başvuru sorularını ve kabul edilince verilecek rolü ayarlamalısın.",
      ephemeral: true
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("application_start")
      .setLabel("Başvuru Yap")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("📝 Yetkili Başvurusu")
        .setDescription(
          "Yetkili olmak için aşağıdaki butona basarak başvurunu oluşturabilirsin."
        )
        .setColor(0x7c3aed)
    ],
    components: [row]
  });

  await interaction.reply({
    content: "✅ Başvuru paneli bu kanala gönderildi.",
    ephemeral: true
  });
}

function clanEmbed(guild) {
  const data = guildData(guild.id);
  const vote = data.clanVote;

  if (!vote) {
    return new EmbedBuilder()
      .setTitle("🗳️ Klan Oylaması")
      .setDescription("Henüz aktif bir oylama yok.")
      .setColor(0x7c3aed);
  }

  const lines = data.clans.map(clan => {
    const count = vote.votes[clan] || 0;
    return `**${clan}** — ${count} oy`;
  });

  return new EmbedBuilder()
    .setTitle("🗳️ Klan Oylaması")
    .setDescription(lines.join("\n") || "Klan bulunmuyor.")
    .setFooter({
      text: `Toplam oy: ${Object.keys(vote.users).length}`
    })
    .setColor(0x7c3aed)
    .setTimestamp();
}

function clanButtons(guild) {
  const data = guildData(guild.id);

  const rows = [];
  let current = [];

  data.clans.forEach((clan, index) => {
    current.push(
      new ButtonBuilder()
        .setCustomId(`clan_vote_${index}`)
        .setLabel(clan.slice(0, 80))
        .setStyle(ButtonStyle.Primary)
    );

    if (current.length === 5) {
      rows.push(new ActionRowBuilder().addComponents(current));
      current = [];
    }
  });

  if (current.length) {
    rows.push(new ActionRowBuilder().addComponents(current));
  }

  return rows.slice(0, 5);
}
client.on("interactionCreate", async interaction => {
  if (interaction.isChatInputCommand()) {
    const guild = interaction.guild;
    if (!guild) return;

    guildData(guild.id);

    if (interaction.commandName === "panel") {
      return configurePanel(interaction);
    }

    if (interaction.commandName === "moderasyon") {
      return moderationMenu(interaction);
    }

    if (interaction.commandName === "başvuru") {
      return applicationSetup(interaction);
    }

    if (interaction.commandName === "çekiliş") {
      if (!isStaff(interaction.member, guild)) {
        return interaction.reply({
          content: "Bu komutu kullanmak için yetkin yok.",
          ephemeral: true
        });
      }

      const ms = parseDuration(interaction.options.getString("süre"));
      const winners = interaction.options.getInteger("kazanan_sayısı");
      const prize = interaction.options.getString("ödül");

      if (!ms || ms < 10000) {
        return interaction.reply({
          content: "Geçerli bir süre gir. Örnek: `10m`, `1h`, `1d`.",
          ephemeral: true
        });
      }

      const end = Date.now() + ms;

      const embed = new EmbedBuilder()
        .setTitle("🎉 ÇEKİLİŞ")
        .setDescription(
          `🎁 **Ödül:** ${prize}\n` +
          `🏆 **Kazanan:** ${winners}\n` +
          `⏰ **Bitiş:** <t:${Math.floor(end / 1000)}:R>\n\n` +
          `Katılmak için aşağıdaki butona bas!`
        )
        .setColor(0x7c3aed)
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`raffle_join_${Date.now()}`)
          .setLabel("Çekilişe Katıl")
          .setEmoji("🎉")
          .setStyle(ButtonStyle.Success)
      );

      const msg = await interaction.channel.send({
        embeds: [embed],
        components: [row]
      });

      guildData(guild.id).raffle[msg.id] = {
        channel: guild.id,
        end,
        winners,
        prize,
        users: []
      };

      save();

      await interaction.reply({
        content: "✅ Çekiliş başlatıldı.",
        ephemeral: true
      });

      setTimeout(() => finishRaffle(guild.id, msg.id), ms);
      return;
    }

    if (interaction.commandName === "drop") {
      if (!isStaff(interaction.member, guild)) {
        return interaction.reply({
          content: "Bu komutu kullanmak için yetkin yok.",
          ephemeral: true
        });
      }

      const prize = interaction.options.getString("ödül");

      if (guildData(guild.id).drop) {
        return interaction.reply({
          content: "Zaten aktif bir drop var.",
          ephemeral: true
        });
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("drop_claim")
          .setLabel("Ödülü Al")
          .setEmoji("🎁")
          .setStyle(ButtonStyle.Success)
      );

      const msg = await interaction.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🎁 DROP")
            .setDescription(
              `**Ödül:** ${prize}\n\nİlk basan kişi ödülü kazanır!`
            )
            .setColor(0xffa500)
        ],
        components: [row]
      });

      guildData(guild.id).drop = {
        messageId: msg.id,
        channelId: msg.channel.id,
        prize
      };

      save();

      await interaction.reply({
        content: "✅ Drop başlatıldı.",
        ephemeral: true
      });

      return;
    }

    if (interaction.commandName === "duyuru") {
      if (!isStaff(interaction.member, guild)) {
        return interaction.reply({
          content: "Bu komutu kullanmak için yetkin yok.",
          ephemeral: true
        });
      }

      const data = guildData(guild.id);
      const channel = data.moderation.announcementChannel
        ? guild.channels.cache.get(data.moderation.announcementChannel)
        : null;

      if (!channel) {
        return interaction.reply({
          content: "Önce moderasyon menüsünden duyuru kanalını seç.",
          ephemeral: true
        });
      }

      const content = interaction.options.getString("mesaj");
      const ping = interaction.options.getBoolean("ping");

      await channel.send({
        content: ping ? "@everyone @here" : undefined,
        embeds: [
          new EmbedBuilder()
            .setTitle("📢 Duyuru")
            .setDescription(content)
            .setColor(0x7c3aed)
            .setFooter({ text: guild.name })
            .setTimestamp()
        ],
        allowedMentions: {
          parse: ping ? ["everyone"] : []
        }
      });

      return interaction.reply({
        content: "✅ Duyuru gönderildi.",
        ephemeral: true
      });
    }

    if (interaction.commandName === "serverinfo") {
      const members = guild.members.cache;
      const active = members.filter(
        m => m.presence && m.presence.status !== "offline"
      ).size;

      const data = guildData(guild.id);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`🖥️ ${guild.name}`)
            .setThumbnail(guild.iconURL({ size: 256 }))
            .addFields(
              { name: "👑 Sunucu Sahibi", value: `<@${guild.ownerId}>`, inline: true },
              { name: "👥 Üye Sayısı", value: `${guild.memberCount}`, inline: true },
              { name: "📚 Kanal Sayısı", value: `${guild.channels.cache.size}`, inline: true },
              { name: "🟢 Aktif Üye", value: `${active}`, inline: true },
              { name: "💬 Toplam Mesaj", value: `${data.messageCount}`, inline: true }
            )
            .setColor(0x7c3aed)
            .setTimestamp()
        ]
      });
    }

    if (interaction.commandName === "klanekle") {
      if (!isStaff(interaction.member, guild)) {
        return interaction.reply({
          content: "Bu komutu kullanmak için yetkin yok.",
          ephemeral: true
        });
      }

      const clan = interaction.options.getString("klan").trim();
      const data = guildData(guild.id);

      if (data.clans.some(x => x.toLowerCase() === clan.toLowerCase())) {
        return interaction.reply({
          content: "Bu klan zaten eklenmiş.",
          ephemeral: true
        });
      }

      if (data.clans.length >= 25) {
        return interaction.reply({
          content: "En fazla 25 klan ekleyebilirsin.",
          ephemeral: true
        });
      }

      data.clans.push(clan);
      save();

      return interaction.reply({
        content: `✅ **${clan}** oylamaya eklendi.`,
        ephemeral: true
      });
    }

    if (interaction.commandName === "klanoyla") {
      if (!isStaff(interaction.member, guild)) {
        return interaction.reply({
          content: "Bu komutu kullanmak için yetkin yok.",
          ephemeral: true
        });
      }

      const data = guildData(guild.id);

      if (data.clanVote) {
        return interaction.reply({
          content: "Zaten aktif bir klan oylaması var.",
          ephemeral: true
        });
      }

      if (!data.clans.length) {
        return interaction.reply({
          content: "Önce `/klanekle` ile klan eklemelisin.",
          ephemeral: true
        });
      }

      data.clanVote = {
        channelId: interaction.channel.id,
        messageId: null,
        users: {},
        votes: {}
      };

      for (const clan of data.clans) {
        data.clanVote.votes[clan] = 0;
      }

      const msg = await interaction.channel.send({
        embeds: [clanEmbed(guild)],
        components: clanButtons(guild)
      });

      data.clanVote.messageId = msg.id;
      save();

      return interaction.reply({
        content: "✅ Klan oylaması başlatıldı.",
        ephemeral: true
      });
    }

    if (interaction.commandName === "klanbitir") {
      if (!isStaff(interaction.member, guild)) {
        return interaction.reply({
          content: "Bu komutu kullanmak için yetkin yok.",
          ephemeral: true
        });
      }

      const data = guildData(guild.id);

      if (!data.clanVote) {
        return interaction.reply({
          content: "Aktif oylama yok.",
          ephemeral: true
        });
      }

      const result = Object.entries(data.clanVote.votes)
        .sort((a, b) => b[1] - a[1]);

      const text = result.length
        ? result.map(([name, votes], i) => `${i + 1}. **${name}** — ${votes} oy`).join("\n")
        : "Oy kullanılmadı.";

      const channel = guild.channels.cache.get(data.clanVote.channelId);

      if (channel && data.clanVote.messageId) {
        const msg = await channel.messages.fetch(data.clanVote.messageId).catch(() => null);
        if (msg) {
          await msg.edit({
            embeds: [
              new EmbedBuilder()
                .setTitle("🏁 Klan Oylaması Sona Erdi")
                .setDescription(text)
                .setColor(0x7c3aed)
            ],
            components: []
          });
        }
      }

      data.clanVote = null;
      save();

      return interaction.reply({
        content: "✅ Klan oylaması bitirildi.",
        ephemeral: true
      });
    }

    if (interaction.commandName === "klandel") {
      if (!isStaff(interaction.member, guild)) {
        return interaction.reply({
          content: "Bu komutu kullanmak için yetkin yok.",
          ephemeral: true
        });
      }

      const clan = interaction.options.getString("klan");
      const data = guildData(guild.id);

      const index = data.clans.findIndex(
        x => x.toLowerCase() === clan.toLowerCase()
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
        content: `🗑️ **${removed}** oylamadan çıkarıldı.`,
        ephemeral: true
      });
    }
  }
});
client.on("interactionCreate", async interaction => {
  if (!interaction.isStringSelectMenu()) return;

  if (interaction.customId === "moderation_menu") {
    const choice = interaction.values[0];

    if (choice === "autorole") {
      return interaction.update({
        content: "Otorol olarak verilecek rolü seç.",
        embeds: [],
        components: [
          new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
              .setCustomId("mod_autorole")
              .setPlaceholder("Otorol seç")
              .setMinValues(1)
              .setMaxValues(1)
          )
        ]
      });
    }

    if (choice === "keyword") {
      const modal = new ModalBuilder()
        .setCustomId("mod_keyword_modal")
        .setTitle("Kelime Cevap Sistemi");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("keyword")
            .setLabel("Kelime")
            .setPlaceholder("sa")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("response")
            .setLabel("Botun vereceği cevap")
            .setPlaceholder("Aleyküm selam")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        )
      );

      return interaction.showModal(modal);
    }

    if (choice === "profanity") {
      const data = guildData(interaction.guild.id);
      data.moderation.profanity = !data.moderation.profanity;

      save();

      return interaction.update({
        content: `Küfür filtresi: **${data.moderation.profanity ? "Açık" : "Kapalı"}**`,
        embeds: [],
        components: []
      });
    }

    if (choice === "links") {
      return interaction.update({
        content: "Link engellemenin aktif olacağı kanalları seç.",
        embeds: [],
        components: [
          new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
              .setCustomId("mod_link_channels")
              .setPlaceholder("Kanalları seç")
              .setChannelTypes(ChannelType.GuildText)
              .setMinValues(1)
              .setMaxValues(10)
          )
        ]
      });
    }

    if (choice === "announcement") {
      return interaction.update({
        content: "Duyuru kanalını seç.",
        embeds: [],
        components: [
          new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
              .setCustomId("mod_announcement")
              .setPlaceholder("Duyuru kanalı")
              .setChannelTypes(ChannelType.GuildText)
              .setMinValues(1)
              .setMaxValues(1)
          )
        ]
      });
    }

    if (choice === "log") {
      return interaction.update({
        content: "Log kanalını seç.",
        embeds: [],
        components: [
          new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
              .setCustomId("mod_log")
              .setPlaceholder("Log kanalı")
              .setChannelTypes(ChannelType.GuildText)
              .setMinValues(1)
              .setMaxValues(1)
          )
        ]
      });
    }

    if (choice === "welcome") {
      return interaction.update({
        content: "Giriş / çıkış kanalını seç.",
        embeds: [],
        components: [
          new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
              .setCustomId("mod_welcome")
              .setPlaceholder("Giriş / çıkış kanalı")
              .setChannelTypes(ChannelType.GuildText)
              .setMinValues(1)
              .setMaxValues(1)
          )
        ]
      });
    }

    if (choice === "suggestion") {
      return interaction.update({
        content: "Öneri kanalını seç.",
        embeds: [],
        components: [
          new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
              .setCustomId("mod_suggestion")
              .setPlaceholder("Öneri kanalı")
              .setChannelTypes(ChannelType.GuildText)
              .setMinValues(1)
              .setMaxValues(1)
          )
        ]
      });
    }
  }

  if (interaction.customId === "application_question_count") {
    const count = Number(interaction.values[0]);

    const modal = new ModalBuilder()
      .setCustomId(`application_questions_${count}`)
      .setTitle(`${count} Başvuru Sorusu`);

    for (let i = 1; i <= count; i++) {
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(`q_${i}`)
            .setLabel(`${i}. soru`)
            .setPlaceholder(`${i}. soruyu yaz`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );
    }

    return interaction.showModal(modal);
  }
});
client.on("interactionCreate", async interaction => {
  if (!interaction.isRoleSelectMenu() && !interaction.isChannelSelectMenu()) return;

  if (interaction.customId === "panel_staff_role") {
    const data = guildData(interaction.guild.id);
    data.ticket.staffRole = interaction.values[0];
    save();

    return interaction.update({
      content: "✅ Yetkili rolü seçildi.\n\nŞimdi ticketlerin açılacağı kategoriyi seç.",
      embeds: [],
      components: [
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId("panel_ticket_category")
            .setPlaceholder("Ticket kategorisini seç")
            .setChannelTypes(ChannelType.GuildCategory)
            .setMinValues(1)
            .setMaxValues(1)
        )
      ]
    });
  }

  if (interaction.customId === "panel_ticket_category") {
    const data = guildData(interaction.guild.id);
    data.ticket.category = interaction.values[0];
    save();

    const modal = new ModalBuilder()
      .setCustomId("ticket_names_modal")
      .setTitle("6 Ticket Butonu");

    for (let i = 0; i < 6; i++) {
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(`ticket_name_${i}`)
            .setLabel(`${i + 1}. buton adı`)
            .setPlaceholder(`Örnek: Genel Destek`)
            .setValue(data.ticket.names[i] || "")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(80)
        )
      );
    }

    return interaction.showModal(modal);
  }

  if (interaction.customId === "mod_autorole") {
    const data = guildData(interaction.guild.id);
    data.moderation.autoRole = interaction.values[0];
    save();

    return interaction.update({
      content: `✅ Otorol ayarlandı: <@&${interaction.values[0]}>`,
      embeds: [],
      components: []
    });
  }

  if (interaction.customId === "mod_link_channels") {
    const data = guildData(interaction.guild.id);
    data.moderation.linkChannels = [...interaction.values];
    save();

    return interaction.update({
      content: `✅ Link engelleme ${interaction.values.length} kanalda aktif edildi.`,
      embeds: [],
      components: []
    });
  }

  if (interaction.customId === "mod_announcement") {
    const data = guildData(interaction.guild.id);
    data.moderation.announcementChannel = interaction.values[0];
    save();

    return interaction.update({
      content: `✅ Duyuru kanalı ayarlandı: <#${interaction.values[0]}>`,
      embeds: [],
      components: [
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId("mod_chat")
            .setPlaceholder("Sohbet kanalını seç")
            .setChannelTypes(ChannelType.GuildText)
            .setMinValues(1)
            .setMaxValues(1)
        )
      ]
    });
  }

  if (interaction.customId === "mod_chat") {
    const data = guildData(interaction.guild.id);
    data.moderation.chatChannel = interaction.values[0];
    save();

    return interaction.update({
      content: `✅ Sohbet kanalı ayarlandı: <#${interaction.values[0]}>`,
      embeds: [],
      components: []
    });
  }

  if (interaction.customId === "mod_log") {
    const data = guildData(interaction.guild.id);
    data.moderation.logChannel = interaction.values[0];
    save();

    return interaction.update({
      content: `✅ Log kanalı ayarlandı: <#${interaction.values[0]}>`,
      embeds: [],
      components: []
    });
  }

  if (interaction.customId === "mod_welcome") {
    const data = guildData(interaction.guild.id);
    data.moderation.welcomeChannel = interaction.values[0];
    save();

    return interaction.update({
      content: `✅ Giriş / çıkış kanalı ayarlandı: <#${interaction.values[0]}>`,
      embeds: [],
      components: []
    });
  }

  if (interaction.customId === "mod_suggestion") {
    const data = guildData(interaction.guild.id);
    data.moderation.suggestionChannel = interaction.values[0];
    save();

    const channel = interaction.guild.channels.cache.get(interaction.values[0]);

    if (channel) {
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("💡 Öneri Kanalı")
            .setDescription(
              "Bu kanal yalnızca öneriler için kullanılabilir.\n\n" +
              "Öneri göndermek için mesajını `Öneri:` ile başlat."
            )
            .setColor(0x7c3aed)
        ]
      }).catch(() => {});
    }

    return interaction.update({
      content: `✅ Öneri kanalı ayarlandı: <#${interaction.values[0]}>`,
      embeds: [],
      components: []
    });
  }
});
client.on("interactionCreate", async interaction => {
  if (!interaction.isModalSubmit()) return;

  if (interaction.customId === "mod_keyword_modal") {
    const data = guildData(interaction.guild.id);

    const word = interaction.fields.getTextInputValue("keyword")
      .trim()
      .toLowerCase();

    const response = interaction.fields.getTextInputValue("response").trim();

    data.moderation.filteredWords[word] = response;
    save();

    return interaction.reply({
      content: `✅ **${word}** kelimesi için otomatik cevap ayarlandı.`,
      ephemeral: true
    });
  }

  if (interaction.customId === "ticket_names_modal") {
    const data = guildData(interaction.guild.id);

    for (let i = 0; i < 6; i++) {
      data.ticket.names[i] = interaction.fields
        .getTextInputValue(`ticket_name_${i}`)
        .trim();
    }

    save();

    const embed = new EmbedBuilder()
      .setTitle("🎫 Destek Merkezi")
      .setDescription(
        "Aşağıdaki kategorilerden ihtiyacına uygun olanı seçerek ticket oluşturabilirsin."
      )
      .setColor(0x7c3aed)
      .setFooter({ text: interaction.guild.name });

    const rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket_open_0")
          .setLabel(data.ticket.names[0])
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("ticket_open_1")
          .setLabel(data.ticket.names[1])
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("ticket_open_2")
          .setLabel(data.ticket.names[2])
          .setStyle(ButtonStyle.Primary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket_open_3")
          .setLabel(data.ticket.names[3])
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("ticket_open_4")
          .setLabel(data.ticket.names[4])
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("ticket_open_5")
          .setLabel(data.ticket.names[5])
          .setStyle(ButtonStyle.Secondary)
      )
    ];

    await interaction.channel.send({
      embeds: [embed],
      components: rows
    });

    return interaction.reply({
      content: "✅ Ticket paneli başarıyla oluşturuldu.",
      ephemeral: true
    });
  }

  if (interaction.customId.startsWith("application_questions_")) {
    if (interaction.guild.ownerId !== interaction.user.id) {
      return interaction.reply({
        content: "Bu işlemi yalnızca sunucu sahibi yapabilir.",
        ephemeral: true
      });
    }

    const count = Number(
      interaction.customId.replace("application_questions_", "")
    );

    const data = guildData(interaction.guild.id);

    data.applications.questions = [];

    for (let i = 1; i <= count; i++) {
      data.applications.questions.push(
        interaction.fields.getTextInputValue(`q_${i}`)
      );
    }

    save();

    return interaction.reply({
      content: "✅ Sorular kaydedildi. Şimdi başvuru kabul edilince verilecek rolü seç.",
      components: [
        new ActionRowBuilder().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId("application_role")
            .setPlaceholder("Başarılı başvuruda verilecek rol")
            .setMinValues(1)
            .setMaxValues(1)
        )
      ],
      ephemeral: true
    });
  }

  if (interaction.customId.startsWith("application_answer_")) {
    const data = guildData(interaction.guild.id);

    const answers = data.applications.questions.map((question, index) => ({
      question,
      answer: interaction.fields.getTextInputValue(`answer_${index}`)
    }));

    try {
      const owner = await interaction.guild.fetchOwner();

      const embed = new EmbedBuilder()
        .setTitle("📝 Yeni Yetkili Başvurusu")
        .setDescription(`${interaction.user} tarafından yeni bir başvuru gönderildi.`)
        .setColor(0x7c3aed)
        .setTimestamp();

      for (const item of answers) {
        embed.addFields({
          name: item.question,
          value: item.answer.slice(0, 1024)
        });
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`application_accept_${interaction.user.id}`)
          .setLabel("Kabul Et")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`application_reject_${interaction.user.id}`)
          .setLabel("Reddet")
          .setEmoji("❌")
          .setStyle(ButtonStyle.Danger)
      );

      await owner.send({
        embeds: [embed],
        components: [row]
      });

      await interaction.reply({
        content: "✅ Başvurun yetkililere iletildi.",
        ephemeral: true
      });
    } catch {
      await interaction.reply({
        content: "Başvuru gönderilemedi. Sunucu sahibine DM gönderilemiyor olabilir.",
        ephemeral: true
      });
    }
  }
});
client.on("interactionCreate", async interaction => {
  if (!interaction.isRoleSelectMenu()) return;

  if (interaction.customId === "application_role") {
    const data = guildData(interaction.guild.id);
    data.applications.role = interaction.values[0];
    save();

    await interaction.reply({
      content: "✅ Başvuru sistemi hazırlandı.\n\nBaşvuru panelinin gönderileceği kanalı seçmek için aşağıdaki butona bas.",
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("application_publish")
            .setLabel("Bu Kanala Başvuru Paneli Gönder")
            .setEmoji("📢")
            .setStyle(ButtonStyle.Primary)
        )
      ],
      ephemeral: true
    });
  }
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "application_publish") {
    return sendApplicationPanel(interaction);
  }

  if (interaction.customId === "application_start") {
    const data = guildData(interaction.guild.id);

    if (!data.applications.questions.length) {
      return interaction.reply({
        content: "Başvuru sistemi henüz hazır değil.",
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId(`application_answer_${Date.now()}`)
      .setTitle("Yetkili Başvurusu");

    data.applications.questions.forEach((question, index) => {
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(`answer_${index}`)
            .setLabel(question.slice(0, 45))
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000)
        )
      );
    });

    return interaction.showModal(modal);
  }

  if (interaction.customId.startsWith("application_accept_")) {
    if (interaction.guild.ownerId !== interaction.user.id) {
      return interaction.reply({
        content: "Bu başvuruyu yalnızca sunucu sahibi değerlendirebilir.",
        ephemeral: true
      });
    }

    const targetId = interaction.customId.replace("application_accept_", "");
    const data = guildData(interaction.guild.id);

    if (!data.applications.role) {
      return interaction.reply({
        content: "Başvuru rolü ayarlanmamış.",
        ephemeral: true
      });
    }

    const member = await interaction.guild.members.fetch(targetId).catch(() => null);

    if (!member) {
      return interaction.reply({
        content: "Başvuru sahibi artık sunucuda değil.",
        ephemeral: true
      });
    }

    const role = interaction.guild.roles.cache.get(data.applications.role);

    if (!role) {
      return interaction.reply({
        content: "Başvuru rolü artık bulunamıyor.",
        ephemeral: true
      });
    }

    try {
      await member.roles.add(role);

      await interaction.update({
        content: `✅ Başvuru kabul edildi. ${member} kullanıcısına ${role} rolü verildi.`,
        embeds: interaction.message.embeds,
        components: []
      });

      try {
        await member.send(
          `🎉 **${interaction.guild.name}** sunucusundaki yetkili başvurun kabul edildi.`
        );
      } catch {}
    } catch {
      await interaction.reply({
        content: "Rol verilemedi. Botun rolü, verilecek rolün üstünde olmalı.",
        ephemeral: true
      });
    }

    return;
  }

  if (interaction.customId.startsWith("application_reject_")) {
    if (interaction.guild.ownerId !== interaction.user.id) {
      return interaction.reply({
        content: "Bu başvuruyu yalnızca sunucu sahibi değerlendirebilir.",
        ephemeral: true
      });
    }

    const targetId = interaction.customId.replace("application_reject_", "");

    await interaction.update({
      content: `❌ Başvuru reddedildi: <@${targetId}>`,
      embeds: interaction.message.embeds,
      components: []
    });

    try {
      const member = await interaction.guild.members.fetch(targetId);
      await member.send(
        `❌ **${interaction.guild.name}** sunucusundaki yetkili başvurun reddedildi.`
      );
    } catch {}

    return;
  }

  if (interaction.customId.startsWith("ticket_open_")) {
    const index = Number(interaction.customId.replace("ticket_open_", ""));
    return openTicket(interaction, index);
  }

  if (interaction.customId === "ticket_claim") {
    const guild = interaction.guild;
    const data = guildData(guild.id);

    if (!isStaff(interaction.member, guild)) {
      return interaction.reply({
        content: "Bu işlemi yalnızca ticket yetkilileri yapabilir.",
        ephemeral: true
      });
    }

    if (interaction.channel.topic?.includes("ticket-claimed:")) {
      return interaction.reply({
        content: "Bu ticket zaten sahiplenilmiş.",
        ephemeral: true
      });
    }

    const ownerMatch = interaction.channel.topic?.match(/^ticket-owner:(\d+)$/);
    const ownerId = ownerMatch?.[1];

    await interaction.channel.permissionOverwrites.edit(
      data.ticket.staffRole,
      {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: false
      }
    );

    await interaction.channel.permissionOverwrites.edit(
      interaction.user.id,
      {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: true
      }
    );

    await interaction.channel.setTopic(
      `ticket-owner:${ownerId || "unknown"};ticket-claimed:${interaction.user.id}`
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🙋 Ticket Sahiplenildi")
          .setDescription(
            `${interaction.user} bu ticketi sahiplendi.\n\n` +
            `Diğer yetkililer ticketi görebilir fakat yazamaz.`
          )
          .setColor(0x00aa55)
          .setTimestamp()
      ]
    });

    return;
  }

  if (interaction.customId === "ticket_help") {
    const guild = interaction.guild;
    const data = guildData(guild.id);

    if (!isStaff(interaction.member, guild)) {
      return interaction.reply({
        content: "Bu işlemi yalnızca ticket yetkilileri yapabilir.",
        ephemeral: true
      });
    }

    await interaction.channel.permissionOverwrites.edit(
      data.ticket.staffRole,
      {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: true
      }
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🆘 Yardım İstendi")
          .setDescription(
            `${interaction.user}, diğer yetkililerden yardım istedi.\n` +
            `Artık yetkili ekip tekrar cevap verebilir.`
          )
          .setColor(0xffaa00)
          .setTimestamp()
      ]
    });

    return;
  }

  if (interaction.customId === "ticket_close") {
    return closeTicket(interaction);
  }

  if (interaction.customId === "drop_claim") {
    const data = guildData(interaction.guild.id);

    if (!data.drop) {
      return interaction.reply({
        content: "Bu drop artık aktif değil.",
        ephemeral: true
      });
    }

    if (
      interaction.message.id !== data.drop.messageId ||
      interaction.channel.id !== data.drop.channelId
    ) {
      return interaction.reply({
        content: "Bu drop artık geçerli değil.",
        ephemeral: true
      });
    }

    const prize = data.drop.prize;

    data.drop = null;
    save();

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("🎁 DROP KAZANILDI")
          .setDescription(
            `🏆 **Kazanan:** ${interaction.user}\n` +
            `🎁 **Ödül:** ${prize}`
          )
          .setColor(0x00cc66)
      ],
      components: []
    });

    return;
  }

  if (interaction.customId.startsWith("raffle_join_")) {
    const guild = interaction.guild;
    const data = guildData(guild.id);
    const messageId = interaction.message.id;

    const raffle = data.raffle[messageId];

    if (!raffle) {
      return interaction.reply({
        content: "Bu çekiliş bulunamadı.",
        ephemeral: true
      });
    }

    if (Date.now() >= raffle.end) {
      return interaction.reply({
        content: "Bu çekiliş sona erdi.",
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
      content: "🎉 Çekilişe başarıyla katıldın.",
      ephemeral: true
    });
  }
});
async function finishRaffle(guildId, messageId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const data = guildData(guildId);
  const raffle = data.raffle[messageId];

  if (!raffle) return;

  const channel = guild.channels.cache.find(
    c => c.isTextBased() && c.messages
  );

  let targetChannel = null;

  for (const [, ch] of guild.channels.cache) {
    if (!ch.isTextBased()) continue;

    const msg = await ch.messages.fetch(messageId).catch(() => null);

    if (msg) {
      targetChannel = ch;
      break;
    }
  }

  const winners = [...raffle.users]
    .sort(() => Math.random() - 0.5)
    .slice(0, raffle.winners);

  if (targetChannel) {
    const oldMessage = await targetChannel.messages
      .fetch(messageId)
      .catch(() => null);

    if (oldMessage) {
      await oldMessage.edit({
        embeds: [
          new EmbedBuilder()
            .setTitle("🏁 ÇEKİLİŞ SONA ERDİ")
            .setDescription(
              winners.length
                ? `🎁 **Ödül:** ${raffle.prize}\n\n` +
                  `🏆 **Kazananlar:**\n${winners.map(x => `<@${x}>`).join("\n")}`
                : `🎁 **Ödül:** ${raffle.prize}\n\nKatılan olmadığı için kazanan bulunamadı.`
            )
            .setColor(0x00aa55)
            .setTimestamp()
        ],
        components: []
      });
    }
  }

  delete data.raffle[messageId];
  save();
}

client.on("error", console.error);

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
