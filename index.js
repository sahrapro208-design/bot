const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Sadece bu ID'ye sahip kullanıcı komutları çalıştırabilir
const SAHIBI = "1003708560728920165"; 
const PREFIX = "k!";

client.on('ready', () => {
    console.log(`${client.user.tag} aktif ve göreve hazır!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    if (message.author.id !== SAHIBI) {
        return message.reply("❌ Bu komutları sadece bot sahibi kullanabilir!");
    }

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // 1. KICK KOMUTU (k!kick @kullanıcı)
    if (command === 'kick') {
        const member = message.mentions.members.first();

        if (!member) {
            return message.reply("Lütfen sunucudan atılacak kullanıcıyı etiketleyin. Örn: `k!kick @user`");
        }

        if (!member.kickable) {
            return message.reply("Bu kullanıcıyı atamıyorum. Yetkim yetersiz veya kişinin rolü benim rolümden üstte.");
        }

        try {
            await member.kick();
            message.channel.send(`✅ **${member.user.tag}** sunucudan başarıyla atıldı.`);
        } catch (error) {
            console.error(error);
            message.reply("Kullanıcı atılırken bir hata oluştu.");
        }
    }

    // 2. ROL VER KOMUTU (k!rolver @kullanıcı @rol)
    if (command === 'rolver') {
        const member = message.mentions.members.first();
        const role = message.mentions.roles.first();

        if (!member || !role) {
            return message.reply("Lütfen bir kullanıcı ve bir rol etiketleyin. Örn: `k!rolver @user @rol`");
        }

        try {
            await member.roles.add(role);
            message.channel.send(`✅ **${member.user.tag}** kullanıcısına **${role.name}** rolü verildi.`);
        } catch (error) {
            console.error(error);
            message.reply("Rol verilirken bir hata oluştu. Bot rolünün, verilecek rolden üstte olduğundan emin olun.");
        }
    }
});

// Token'ı Railway'deki Ortam Değişkeninden (Variables) çeker
client.login(process.env.TOKEN);
