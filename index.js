const {
  Client, GatewayIntentBits, Partials, PermissionsBitField, ChannelType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, EmbedBuilder, AttachmentBuilder
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) throw new Error('DISCORD_TOKEN Railway Variables içinde tanımlı değil.');

const DB_FILE = path.join(__dirname, 'database.json');
let db = {};
if (fs.existsSync(DB_FILE)) {
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { db = {}; }
}
function save(){ try{fs.writeFileSync(DB_FILE,JSON.stringify(db,null,2));}catch(e){console.error('DB save:',e.message);}}
function gd(id){
  if(!db[id]) db[id]={
    ticket:{staffRole:null,category:null,names:['Genel Destek','Teknik Destek','Oyuncu Şikayet','Yetkili Şikayet','Satın Alım','Diğer']},
    moderation:{autoRole:null,answers:{},badWords:[],linkChannels:[],announcementChannel:null,chatChannel:null,logChannel:null,welcomeChannel:null,leaveChannel:null,suggestionChannel:null},
    application:{role:null,questions:[]},
    stats:{messages:0}
  };
  return db[id];
}
const setups=new Map(), appSetups=new Map(), raffles=new Map(), drops=new Map(), clanVotes=new Map();

const client=new Client({
  intents:[
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences
  ],
  partials:[Partials.Channel,Partials.Message]
});

const cmds=[
 {name:'panel',description:'Ticket panelini kurar'},
 {name:'moderasyon',description:'Moderasyon ayarlarını açar'},
 {name:'cekilis',description:'Çekiliş başlatır',options:[
  {name:'sure',description:'10m, 1h, 1d',type:3,required:true},
  {name:'kazanan',description:'Kazanan sayısı',type:4,required:true},
  {name:'odul',description:'Ödül',type:3,required:true}
 ]},
 {name:'drop',description:'Drop başlatır',options:[
  {name:'odul',description:'Ödül',type:3,required:true}
 ]},
 {name:'duyuru',description:'Duyuru gönderir',options:[
  {name:'mesaj',description:'Mesaj',type:3,required:true}
 ]},
 {name:'basvuru',description:'Yetkili başvuru panelini kurar'},
 {name:'klanekle',description:'Klan ekler',options:[
  {name:'klan',description:'Klan adı',type:3,required:true}
 ]},
 {name:'klandel',description:'Klan siler',options:[
  {name:'klan',description:'Klan adı',type:3,required:true}
 ]},
 {name:'klanoyla',description:'Klan oylaması başlatır'},
 {name:'klanbitir',description:'Klan oylamasını bitirir'},
 {name:'yardim',description:'Komutları gösterir'}
];
function norm(s){
  return String(s||'').toLocaleLowerCase('tr-TR').trim();
}

function parseDuration(s){
  const m=String(s).match(/^(\d+)(s|m|h|d|w)$/i);
  if(!m)return null;
  return Number(m[1])*({
    s:1000,
    m:60000,
    h:3600000,
    d:86400000,
    w:604800000
  }[m[2].toLowerCase()]);
}

function isStaff(i){
  const d=gd(i.guild.id);
  return i.memberPermissions?.has(PermissionsBitField.Flags.Administrator) ||
    Boolean(d.ticket.staffRole&&i.member.roles.cache.has(d.ticket.staffRole));
}

function reply(i,c){
  return i.reply({content:c,ephemeral:true}).catch(()=>{});
}

async function sendLog(g,c){
  const id=gd(g.id).moderation.logChannel;
  if(id){
    const ch=g.channels.cache.get(id);
    if(ch)await ch.send({content:c}).catch(()=>{});
  }
}

function ticketPanel(d){
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_open_menu')
      .setPlaceholder('Ticket kategorisini seç')
      .addOptions(d.ticket.names.map((n,i)=>({
        label:String(n).slice(0,100),
        value:String(i)
      })))
  );
}
function moderationPanel(){
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('moderation_menu')
      .setPlaceholder('Bir ayar seç')
      .addOptions([
        {label:'Otomatik Rol',value:'auto_role'},
        {label:'Otomatik Cevap',value:'auto_reply'},
        {label:'Küfür Filtresi',value:'badwords'},
        {label:'Link Kanalları',value:'link_channels'},
        {label:'Duyuru Kanalları',value:'announcement'},
        {label:'Log Kanalı',value:'log'},
        {label:'Hoş Geldin',value:'welcome'},
        {label:'Ayrılış',value:'leave'},
        {label:'Öneri Kanalı',value:'suggestion'}
      ])
  );
}

client.once('ready',async()=>{
  console.log(`Bot aktif: ${client.user.tag}`);
  try{
    await client.application.commands.set(cmds);
    console.log('Slash komutları yüklendi.');
  }catch(e){
    console.error('Komut yükleme:',e);
  }
});

client.on('interactionCreate',async i=>{
  try{
    if(i.isChatInputCommand()) return await command(i);
    if(i.isStringSelectMenu()){
      if(i.customId==='clan_vote_menu')return await handleClanMenu(i);
      return await stringSelect(i);
    }
    if(i.isRoleSelectMenu())return await roleSelect(i);
    if(i.isChannelSelectMenu())return await channelSelect(i);
    if(i.isModalSubmit())return await modal(i);
    if(i.isButton())return await button(i);
  }catch(e){
    console.error('INTERACTION:',e);
    if(!i.replied&&!i.deferred)
      await i.reply({content:'İşlem sırasında hata oluştu.',ephemeral:true}).catch(()=>{});
    else
      await i.editReply({content:'İşlem sırasında hata oluştu.',components:[]}).catch(()=>{});
  }
});
async function command(i){
  const d=gd(i.guild.id);

  if(i.commandName==='yardim')
    return reply(i,
`/panel
/moderasyon
/cekilis
/drop
/duyuru
/basvuru
/klanekle
/klandel
/klanoyla
/klanbitir

k!lock
k!unlock
k!sıfırla
!serverinfo`);

  if(i.commandName==='panel'){
    if(!i.memberPermissions.has(PermissionsBitField.Flags.Administrator))
      return reply(i,'Yönetici yetkisi gerekli.');

    if(d.ticket.staffRole&&d.ticket.category)
      return i.reply({
        embeds:[
          new EmbedBuilder()
            .setTitle('🎫 Destek Merkezi')
            .setDescription('Aşağıdaki menüden destek türünü seç.')
        ],
        components:[ticketPanel(d)]
      });

    setups.set(i.guild.id,{channel:i.channel.id});

    return i.reply({
      content:'Ticket yetkili rolünü seç.',
      components:[
        new ActionRowBuilder().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId('ticket_staff_role')
            .setPlaceholder('Yetkili rolü seç')
        )
      ],
      ephemeral:true
    });
  }

  if(i.commandName==='moderasyon'){
    if(!i.memberPermissions.has(PermissionsBitField.Flags.Administrator))
      return reply(i,'Yönetici yetkisi gerekli.');

    return i.reply({
      content:'Moderasyon ayarı seç.',
      components:[moderationPanel()],
      ephemeral:true
    });
  }

  if(i.commandName==='cekilis'){
    if(!i.memberPermissions.has(PermissionsBitField.Flags.ManageGuild))
      return reply(i,'Sunucuyu Yönet yetkisi gerekli.');

    const ms=parseDuration(i.options.getString('sure'));
    const winners=i.options.getInteger('kazanan');
    const prize=i.options.getString('odul');

    if(!ms||ms<1000||winners<1)
      return reply(i,'Geçersiz süre veya kazanan sayısı.');

    const id=`r_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    const end=Date.now()+ms;

    const msg=await i.channel.send({
      embeds:[
        new EmbedBuilder()
          .setTitle('🎉 Çekiliş')
          .setDescription(
            `Ödül: **${prize}**\nKazanan: **${winners}**\nBitiş: <t:${Math.floor(end/1000)}:R>`
          )
      ],
      components:[
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`raffle_${id}`)
            .setLabel('Katıl')
            .setStyle(ButtonStyle.Primary)
        )
      ]
    });

    raffles.set(id,{
      guild:i.guild.id,
      channel:i.channel.id,
      message:msg.id,
      end,
      winners,
      prize,
      users:new Set()
    });

    setTimeout(()=>finishRaffle(id),ms);
    return reply(i,'Çekiliş başlatıldı.');
  }
      if(i.commandName==='drop'){
    if(!i.memberPermissions.has(PermissionsBitField.Flags.ManageGuild))
      return reply(i,'Sunucuyu Yönet yetkisi gerekli.');

    const id=`d_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    const prize=i.options.getString('odul');

    const msg=await i.channel.send({
      embeds:[
        new EmbedBuilder()
          .setTitle('🎁 DROP')
          .setDescription(`Ödül: **${prize}**\nİlk tıklayan kazanır.`)
      ],
      components:[
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`drop_${id}`)
            .setLabel('🎁 Al')
            .setStyle(ButtonStyle.Success)
        )
      ]
    });

    drops.set(id,{
      channel:i.channel.id,
      message:msg.id,
      prize
    });

    return reply(i,'Drop gönderildi.');
  }

  if(i.commandName==='duyuru'){
    if(!i.memberPermissions.has(PermissionsBitField.Flags.ManageGuild))
      return reply(i,'Yetkin yok.');

    const m=i.options.getString('mesaj');
    const a=d.moderation.announcementChannel;
    const c=d.moderation.chatChannel;

    if(!a||!c)
      return reply(i,'Duyuru ve sohbet kanallarını önce ayarla.');

    const ac=i.guild.channels.cache.get(a);
    const cc=i.guild.channels.cache.get(c);

    if(!ac||!cc)
      return reply(i,'Kanal ayarı geçersiz.');

    await ac.send({
      content:'@everyone',
      allowedMentions:{parse:['everyone']},
      embeds:[
        new EmbedBuilder()
          .setTitle('📢 Duyuru')
          .setDescription(m)
      ]
    });

    await cc.send({
      embeds:[
        new EmbedBuilder()
          .setTitle('📢 Duyuru')
          .setDescription(m)
      ]
    });

    return reply(i,'Duyuru gönderildi.');
  }

  if(i.commandName==='basvuru'){
    if(!i.memberPermissions.has(PermissionsBitField.Flags.Administrator))
      return reply(i,'Yönetici yetkisi gerekli.');

    appSetups.set(i.guild.id,{
      channel:i.channel.id,
      count:0,
      questions:[]
    });

    const m=new ModalBuilder()
      .setCustomId('app_count')
      .setTitle('Başvuru Kurulumu')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('count')
            .setLabel('Soru sayısı (1-5)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

    return i.showModal(m);
  }

  if(['klanekle','klandel','klanoyla','klanbitir'].includes(i.commandName))
    return clanCommand(i);
}
async function stringSelect(i){
  const d=gd(i.guild.id);

  if(i.customId==='ticket_open_menu'){
    await i.deferReply({ephemeral:true});

    const idx=Number(i.values[0]);

    const old=i.guild.channels.cache.find(
      c=>c.topic?.includes(`ticket-owner:${i.user.id}`)
    );

    if(old)
      return i.editReply(`Zaten açık ticketın var: ${old}`);

    if(!d.ticket.staffRole||!d.ticket.category)
      return i.editReply('Ticket sistemi ayarlı değil.');

    const safe=i.user.username
      .toLowerCase()
      .replace(/[^a-z0-9-]/g,'')
      .slice(0,18)||'kullanici';

    const ch=await i.guild.channels.create({
      name:`ticket-${safe}`,
      type:ChannelType.GuildText,
      parent:d.ticket.category,
      topic:`ticket-owner:${i.user.id};ticket-type:${idx}`
    });

    await ch.permissionOverwrites.edit(
      i.guild.roles.everyone,
      {ViewChannel:false}
    );

    await ch.permissionOverwrites.edit(
      i.user.id,
      {
        ViewChannel:true,
        SendMessages:true,
        ReadMessageHistory:true
      }
    );

    await ch.permissionOverwrites.edit(
      d.ticket.staffRole,
      {
        ViewChannel:true,
        SendMessages:true,
        ReadMessageHistory:true
      }
    );

    const row=new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_claim')
        .setLabel('🎫 Üstlen')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('ticket_help')
        .setLabel('🆘 Yardım')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('🔒 Kapat')
        .setStyle(ButtonStyle.Danger)
    );

    await ch.send({
      content:`${i.user} <@&${d.ticket.staffRole}>`,
      embeds:[
        new EmbedBuilder()
          .setTitle(`🎫 ${d.ticket.names[idx]}`)
          .setDescription(
            'Yetkili ticketı üstlenebilir. Üstlenildikten sonra diğer yetkililer yazamaz; gerekirse Yardım ile tekrar açılır.'
          )
      ],
      components:[row]
    });

    return i.editReply(`Ticket açıldı: ${ch}`);
  }

  if(i.customId==='moderation_menu'){
    const v=i.values[0];

    if(v==='auto_role')
      return i.reply({
        content:'Otomatik rolü seç.',
        components:[
          new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
              .setCustomId('mod_auto_role')
              .setPlaceholder('Rol seç')
          )
        ],
        ephemeral:true
      });

    if(v==='auto_reply'){
      const m=new ModalBuilder()
        .setCustomId('mod_auto_reply')
        .setTitle('Otomatik Cevap');

      m.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('trigger')
            .setLabel('Tetikleyici')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('response')
            .setLabel('Cevap')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        )
      );

      return i.showModal(m);
    }

    if(v==='badwords'){
      const m=new ModalBuilder()
        .setCustomId('mod_badwords')
        .setTitle('Küfür Filtresi');

      m.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('words')
            .setLabel('Kelimeleri virgülle ayır')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
        )
      );

      return i.showModal(m);
    }
          if(v==='link_channels')
      return i.reply({
        content:'Link engellenecek kanalları seç.',
        components:[
          new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
              .setCustomId('mod_link_channels')
              .setChannelTypes(ChannelType.GuildText)
              .setMinValues(1)
              .setMaxValues(10)
          )
        ],
        ephemeral:true
      });

    const map={
      announcement:'mod_announcement',
      log:'mod_log',
      welcome:'mod_welcome',
      leave:'mod_leave',
      suggestion:'mod_suggestion'
    };

    if(map[v])
      return i.reply({
        content:v==='announcement'
          ?'Önce duyuru kanalını, sonra sohbet kanalını seç.'
          :'Kanalı seç.',
        components:[
          new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
              .setCustomId(map[v])
              .setChannelTypes(ChannelType.GuildText)
              .setMinValues(1)
              .setMaxValues(v==='announcement'?2:1)
          )
        ],
        ephemeral:true
      });
  }
}

async function handleClanMenu(i){
  const v=clanVotes.get(i.guild.id);

  if(!v?.active)
    return reply(i,'Oylama aktif değil.');

  if(v.users.has(i.user.id))
    return reply(i,'Zaten oy verdin ve oyun değiştirilemez.');

  const name=i.values[0];

  if(!v.clans.has(name))
    return reply(i,'Klan bulunamadı.');

  await i.deferUpdate();

  v.clans.set(name,v.clans.get(name)+1);
  v.users.set(i.user.id,name);

  await updateClanMessage(v);
}

async function roleSelect(i){
  const d=gd(i.guild.id);

  if(i.customId==='ticket_staff_role'){
    d.ticket.staffRole=i.values[0];
    save();

    return i.reply({
      content:'Ticket kategorisini seç.',
      components:[
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('ticket_category')
            .setChannelTypes(ChannelType.GuildCategory)
            .setMinValues(1)
            .setMaxValues(1)
        )
      ],
      ephemeral:true
    });
  }

  if(i.customId==='mod_auto_role'){
    d.moderation.autoRole=i.values[0];
    save();
    return reply(i,'Otomatik rol ayarlandı.');
  }
      if(i.customId==='app_role'){
    const s=appSetups.get(i.guild.id);

    if(!s)
      return reply(i,'Kurulum bulunamadı.');

    d.application.role=i.values[0];
    d.application.questions=s.questions;

    save();
    appSetups.delete(i.guild.id);

    const ch=i.guild.channels.cache.get(s.channel);

    if(ch)
      await ch.send({
        embeds:[
          new EmbedBuilder()
            .setTitle('📝 Yetkili Başvurusu')
            .setDescription('Yetkili olmak için aşağıdaki butona basınız.')
        ],
        components:[
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('application_start')
              .setLabel('Başvuru Yap')
              .setStyle(ButtonStyle.Primary)
          )
        ]
      });

    return reply(i,'Başvuru sistemi kuruldu.');
  }
}

async function channelSelect(i){
  const d=gd(i.guild.id);

  if(i.customId==='ticket_category'){
    d.ticket.category=i.values[0];
    save();

    const m=new ModalBuilder()
      .setCustomId('ticket_names1')
      .setTitle('Ticket isimleri 1/2');

    for(let x=0;x<3;x++){
      m.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(`n${x}`)
            .setLabel(`${x+1}. Ticket adı`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );
    }

    return i.showModal(m);
  }

  if(i.customId==='mod_link_channels'){
    d.moderation.linkChannels=i.values;
    save();
    return reply(i,'Link kanalları ayarlandı.');
  }

  const map={
    mod_log:'logChannel',
    mod_welcome:'welcomeChannel',
    mod_leave:'leaveChannel',
    mod_suggestion:'suggestionChannel'
  };

  if(i.customId==='mod_announcement'){
    d.moderation.announcementChannel=i.values[0];
    d.moderation.chatChannel=i.values[1]||null;
    save();
    return reply(i,'Duyuru ve sohbet kanalları ayarlandı.');
  }

  if(map[i.customId]){
    d.moderation[map[i.customId]]=i.values[0];
    save();
    return reply(i,'Kanal ayarlandı.');
  }
}
async function modal(i){
  const d=gd(i.guild.id);

  if(i.customId==='ticket_names1'){
    for(let x=0;x<3;x++)
      d.ticket.names[x]=i.fields.getTextInputValue(`n${x}`);

    save();

    const m=new ModalBuilder()
      .setCustomId('ticket_names2')
      .setTitle('Ticket isimleri 2/2');

    for(let x=3;x<6;x++){
      m.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(`n${x}`)
            .setLabel(`${x+1}. Ticket adı`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );
    }

    return i.showModal(m);
  }

  if(i.customId==='ticket_names2'){
    for(let x=3;x<6;x++)
      d.ticket.names[x]=i.fields.getTextInputValue(`n${x}`);

    save();

    const s=setups.get(i.guild.id);
    const ch=i.guild.channels.cache.get(s?.channel);

    if(ch)
      await ch.send({
        embeds:[
          new EmbedBuilder()
            .setTitle('🎫 Destek Merkezi')
            .setDescription('Destek almak için aşağıdaki menüden bir kategori seç.')
        ],
        components:[ticketPanel(d)]
      });

    setups.delete(i.guild.id);

    return reply(i,'Ticket sistemi kuruldu ve panel gönderildi.');
  }

  if(i.customId==='mod_auto_reply'){
    d.moderation.answers[norm(i.fields.getTextInputValue('trigger'))]=
      i.fields.getTextInputValue('response');

    save();

    return reply(i,'Otomatik cevap kaydedildi.');
  }

  if(i.customId==='mod_badwords'){
    d.moderation.badWords=
      i.fields.getTextInputValue('words')
      .split(',')
      .map(norm)
      .filter(Boolean);

    save();

    return reply(i,'Küfür filtresi kaydedildi.');
  }

  if(i.customId==='app_count'){
    const n=Number(i.fields.getTextInputValue('count'));

    if(!Number.isInteger(n)||n<1||n>5)
      return reply(i,'Soru sayısı 1-5 olmalı.');

    const s=appSetups.get(i.guild.id);

    if(!s)
      return reply(i,'Kurulum bulunamadı.');

    s.count=n;

    const m=new ModalBuilder()
      .setCustomId('app_questions')
      .setTitle(`Sorular 1/${n}`);

    for(let x=0;x<n;x++){
      m.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(`q${x}`)
            .setLabel(`${x+1}. soru`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );
    }

    return i.showModal(m);
  }
      if(i.customId==='app_questions'){
    const s=appSetups.get(i.guild.id);

    if(!s)
      return reply(i,'Kurulum bulunamadı.');

    s.questions=Array.from(
      {length:s.count},
      (_,x)=>i.fields.getTextInputValue(`q${x}`)
    );

    return i.reply({
      content:'Başvuruda verilecek rolü seç.',
      components:[
        new ActionRowBuilder().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId('app_role')
            .setPlaceholder('Rol seç')
        )
      ],
      ephemeral:true
    });
  }

  if(i.customId==='application_submit'){
    await i.deferReply({ephemeral:true});

    const d=gd(i.guild.id);
    const owner=await i.guild.fetchOwner();

    const fields=d.application.questions.map((q,x)=>({
      name:String(q).slice(0,256),
      value:i.fields.getTextInputValue(`a${x}`).slice(0,1000)||'-'
    }));

    const e=new EmbedBuilder()
      .setTitle('📝 Yeni Yetkili Başvurusu')
      .setDescription(`${i.user} tarafından gönderildi.`)
      .addFields(fields)
      .setFooter({
        text:`APP:${i.guild.id}:${i.user.id}`
      });

    const row=new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('application_accept')
        .setLabel('Kabul Et')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId('application_reject')
        .setLabel('Reddet')
        .setStyle(ButtonStyle.Danger)
    );

    try{
      await owner.send({
        embeds:[e],
        components:[row]
      });

      return i.editReply(
        'Başvurun sunucu sahibine gönderildi.'
      );
    }catch{
      return i.editReply(
        'Başvuru gönderildi ancak sunucu sahibine DM ulaştırılamadı.'
      );
    }
  }
}
async function button(i){
  if(i.customId==='application_start'){
    const d=gd(i.guild.id);

    if(!d.application.questions.length)
      return reply(i,'Başvuru sistemi hazır değil.');

    const m=new ModalBuilder()
      .setCustomId('application_submit')
      .setTitle('Yetkili Başvurusu');

    d.application.questions.forEach((q,x)=>{
      m.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(`a${x}`)
            .setLabel(String(q).slice(0,45))
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        )
      );
    });

    return i.showModal(m);
  }

  if(i.customId==='application_accept'||i.customId==='application_reject'){
    const footer=i.message.embeds[0]?.footer?.text||'';
    const raw=footer.startsWith('APP:')?footer.slice(4):'';
    const parts=raw.split(':');

    const g=client.guilds.cache.get(parts[0]);
    const uid=parts[1];

    if(!g||i.user.id!==g.ownerId)
      return reply(i,'Sadece sunucu sahibi bu işlemi yapabilir.');

    await i.deferUpdate();

    if(i.customId==='application_accept'){
      const d=gd(g.id);
      const member=await g.members.fetch(uid).catch(()=>null);

      if(member&&d.application.role)
        await member.roles.add(d.application.role).catch(()=>{});
    }

    await i.message.edit({
      components:[]
    }).catch(()=>{});

    return;
  }

  if(i.customId.startsWith('raffle_')){
    const r=raffles.get(i.customId.slice(7));

    if(!r)
      return reply(i,'Bu çekiliş bitmiş.');

    if(r.users.has(i.user.id))
      return reply(i,'Zaten katıldın.');

    await i.deferReply({ephemeral:true});

    r.users.add(i.user.id);

    return i.editReply('Çekilişe katıldın.');
  }

  if(i.customId.startsWith('drop_')){
    const id=i.customId.slice(5);
    const d=drops.get(id);

    if(!d)
      return reply(i,'Bu drop alınmış.');

    await i.deferUpdate();

    drops.delete(id);

    return i.message.edit({
      content:`🎁 **${d.prize}** ödülünü ${i.user} kazandı!`,
      embeds:[],
      components:[]
    });
  }
      if(['ticket_claim','ticket_help','ticket_close'].includes(i.customId)){
    if(!isStaff(i))
      return reply(i,'Ticket yetkisi gerekli.');

    const d=gd(i.guild.id);
    const ch=i.channel;
    const topic=ch.topic||'';

    if(i.customId==='ticket_claim'){
      await i.deferReply({ephemeral:true});

      if(topic.includes(';ticket-claimed:'))
        return i.editReply('Bu ticket zaten üstlenilmiş.');

      await ch.permissionOverwrites.edit(
        d.ticket.staffRole,
        {SendMessages:false}
      );

      await ch.permissionOverwrites.edit(
        i.user.id,
        {
          ViewChannel:true,
          SendMessages:true,
          ReadMessageHistory:true
        }
      );

      await ch.setTopic(
        `${topic};ticket-claimed:${i.user.id}`
      );

      return i.editReply('Ticketı üstlendin.');
    }

    if(i.customId==='ticket_help'){
      const owner=topic.match(
        /ticket-owner:(\d+)/
      )?.[1];

      const claimed=topic.match(
        /ticket-claimed:(\d+)/
      )?.[1];

      if(owner!==i.user.id&&claimed!==i.user.id)
        return reply(
          i,
          'Bu butonu sadece ticket sahibi veya ticketı üstlenen yetkili kullanabilir.'
        );

      await i.deferReply({ephemeral:true});

      await ch.permissionOverwrites.edit(
        d.ticket.staffRole,
        {SendMessages:true}
      );

      return i.editReply(
        'Yetkililerin yazması tekrar açıldı.'
      );
    }

    await i.deferReply({ephemeral:true});

    const owner=topic.match(
      /ticket-owner:(\d+)/
    )?.[1];

    const msgs=await ch.messages.fetch({
      limit:100
    }).catch(()=>new Map());

    let out=`TICKET TRANSKRİPT\n${ch.name}\n\n`;

    [...msgs.values()]
      .reverse()
      .forEach(m=>{
        out+=`[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content||''}\n`;
      });

    const buf=Buffer.from(out,'utf8');

    if(owner){
      const u=await client.users.fetch(owner).catch(()=>null);

      if(u)
        await u.send({
          content:'Ticket transkriptin:',
          files:[
            new AttachmentBuilder(
              buf,
              {name:`transcript-${ch.id}.txt`}
            )
          ]
        }).catch(()=>{});
    }

    const role=i.guild.roles.cache.get(
      d.ticket.staffRole
    );

    if(role){
      for(const [,m] of role.members){
        await m.send({
          content:`${ch.name} ticket transkripti:`,
          files:[
            new AttachmentBuilder(
              buf,
              {name:`transcript-${ch.id}.txt`}
            )
          ]
        }).catch(()=>{});
      }
    }

    await sendLog(
      i.guild,
      `🔒 Ticket kapatıldı: ${ch.name} | ${i.user.tag}`
    );

    await ch.delete().catch(()=>{});

    return;
        if(i.customId.startsWith('clan_vote:')){
    const v=clanVotes.get(i.guild.id);

    if(!v?.active)
      return reply(i,'Oylama aktif değil.');

    if(v.users.has(i.user.id))
      return reply(i,'Zaten oy verdin.');

    const name=i.customId.slice(10);

    if(!v.clans.has(name))
      return reply(i,'Klan bulunamadı.');

    await i.deferUpdate();

    v.clans.set(
      name,
      v.clans.get(name)+1
    );

    v.users.set(i.user.id,name);

    return updateClanMessage(v);
  }
}

async function clanCommand(i){
  let v=clanVotes.get(i.guild.id);

  if(i.commandName==='klanekle'){
    if(!v)
      v={
        clans:new Map(),
        users:new Map(),
        active:false,
        message:null,
        channel:null
      };

    const n=norm(
      i.options.getString('klan')
    );

    if(v.clans.has(n))
      return reply(i,'Bu klan zaten ekli.');

    if(v.clans.size>=25)
      return reply(i,'En fazla 25 klan eklenebilir.');

    v.clans.set(n,0);
    clanVotes.set(i.guild.id,v);

    return reply(i,`Klan eklendi: ${n}`);
  }

  if(i.commandName==='klandel'){
    if(!v)
      return reply(i,'Klan listesi yok.');

    const n=norm(
      i.options.getString('klan')
    );

    if(!v.clans.delete(n))
      return reply(i,'Klan bulunamadı.');

    if(v.active)
      await updateClanMessage(v);

    return reply(i,'Klan silindi.');
  }

  if(i.commandName==='klanoyla'){
    if(!v||!v.clans.size)
      return reply(i,'Önce /klanekle ile klan ekle.');

    if(v.active)
      return reply(i,'Zaten aktif oylama var.');

    v.active=true;
    v.users=new Map();
    v.channel=i.channel.id;

    v.message=await i.channel.send({
      embeds:[
        new EmbedBuilder()
          .setTitle('🏆 Klan Oylaması')
          .setDescription(
            'Bir klan seçin.\n\n'+
            [...v.clans]
              .map(([n,c])=>`**${n}**: ${c}`)
              .join('\n')
          )
      ],
      components:[
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('clan_vote_menu')
            .setPlaceholder('Klan seç')
            .addOptions(
              [...v.clans.keys()].map(n=>({
                label:n.slice(0,100),
                value:n.slice(0,100)
              }))
            )
        )
      ]
    });

    clanVotes.set(i.guild.id,v);

    return reply(i,'Oylama başladı.');
  }

  if(i.commandName==='klanbitir'){
    if(!v?.active)
      return reply(i,'Aktif oylama yok.');

    v.active=false;

    await updateClanMessage(v);

    return reply(i,'Oylama bitirildi.');
  }
}
    async function updateClanMessage(v){
  if(!v.message)return;

  const desc=[...v.clans]
    .map(([n,c])=>`**${n}**: ${c}`)
    .join('\n')||'Klan yok.';

  await v.message.edit({
    embeds:[
      new EmbedBuilder()
        .setTitle('🏆 Klan Oylaması')
        .setDescription(desc)
    ],
    components:v.active
      ?[
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('clan_vote_menu')
            .setPlaceholder('Klan seç')
            .addOptions(
              [...v.clans.keys()].map(n=>({
                label:n.slice(0,100),
                value:n.slice(0,100)
              }))
            )
        )
      ]
      :[]
  }).catch(()=>{});
}

client.on('messageCreate',async m=>{
  if(m.author.bot||!m.guild)return;

  const d=gd(m.guild.id);

  d.stats.messages=(d.stats.messages||0)+1;

  if(d.stats.messages%10===0)
    save();

  if(m.content.startsWith('k!')){
    const cmd=norm(m.content.slice(2));

    if(cmd==='lock'){
      await m.channel.permissionOverwrites
        .edit(m.guild.roles.everyone,{SendMessages:false})
        .catch(()=>{});

      return m.channel.send('🔒 Kanal kilitlendi.');
    }

    if(cmd==='unlock'){
      await m.channel.permissionOverwrites
        .edit(m.guild.roles.everyone,{SendMessages:null})
        .catch(()=>{});

      return m.channel.send('🔓 Kanal açıldı.');
    }

    if(cmd==='sıfırla'){
      const msgs=await m.channel.messages
        .fetch({limit:100})
        .catch(()=>new Map());

      await m.channel.bulkDelete(msgs,true).catch(()=>{});

      const x=await m.channel.send(
        'Kanal başarıyla sıfırlandı.'
      );

      setTimeout(
        ()=>x.delete().catch(()=>{}),
        3000
      );

      return;
    }
  }

  if(norm(m.content)==='!serverinfo'){
    const active=m.guild.members.cache
      .filter(x=>x.presence?.status)
      .size;

    return m.channel.send(
`Sunucu: ${m.guild.name}
Sahip: <@${m.guild.ownerId}>
Üye: ${m.guild.memberCount}
Kanal: ${m.guild.channels.cache.size}
Aktif: ${active}
Toplam mesaj: ${d.stats.messages}`
    );
  }

  const ans=d.moderation.answers[norm(m.content)];

  if(ans){
    await m.channel.send(ans);
    return;
  }

  if(
    d.moderation.suggestionChannel===m.channel.id &&
    !norm(m.content).startsWith('öneri:')
  ){
    await m.delete().catch(()=>{});

    const x=await m.channel.send(
      `${m.author} bu kanal sadece önerilere açıktır.`
    );

    setTimeout(
      ()=>x.delete().catch(()=>{}),
      3000
    );

    return;
  }

  if(
    d.moderation.linkChannels.includes(m.channel.id) &&
    /(https?:\/\/|www\.)/i.test(m.content) &&
    !m.member.permissions.has(
      PermissionsBitField.Flags.ManageMessages
    )
  ){
    await m.delete().catch(()=>{});
    return;
  }

  if(
    d.moderation.badWords.some(
      w=>w&&norm(m.content).includes(w)
    ) &&
    !m.member.permissions.has(
      PermissionsBitField.Flags.ManageMessages
    )
  ){
    await m.delete().catch(()=>{});
  }
});

client.on('messageDelete',async m=>{
  if(!m.guild||m.author?.bot)return;

  await sendLog(
    m.guild,
    `🗑️ Silinen mesaj | ${m.author?.tag||'Bilinmiyor'} | #${m.channel?.name||'?'} | ${m.content||'[içerik yok]'}`
  );
});

client.on('messageUpdate',async(o,n)=>{
  if(!n.guild||n.author?.bot||o.content===n.content)return;

  await sendLog(
    n.guild,
`✏️ Düzenlenen mesaj | ${n.author?.tag||'Bilinmiyor'} | #${n.channel?.name||'?'}
Eski: ${o.content||'[yok]'}
Yeni: ${n.content||'[yok]'}`
  );
});

client.on('guildMemberAdd',async m=>{
  const d=gd(m.guild.id);

  if(d.moderation.autoRole)
    await m.roles.add(d.moderation.autoRole).catch(()=>{});

  const id=d.moderation.welcomeChannel;

  if(id){
    const c=m.guild.channels.cache.get(id);

    if(c)
      await c.send({
        embeds:[
          new EmbedBuilder()
            .setTitle('👋 Hoş Geldin')
            .setDescription(
`${m} sunucuya katıldı.
Katılma: <t:${Math.floor((m.joinedTimestamp||Date.now())/1000)}:F>
Hesap oluşturma: <t:${Math.floor(m.user.createdTimestamp/1000)}:F>`
            )
        ]
      }).catch(()=>{});
  }
});

client.on('guildMemberRemove',async m=>{
  const id=gd(m.guild.id).moderation.leaveChannel;

  if(id){
    const c=m.guild.channels.cache.get(id);

    if(c)
      await c.send(
        `👋 ${m.user.tag} sunucudan ayrıldı.`
      ).catch(()=>{});
  }
});

async function finishRaffle(id){
  const r=raffles.get(id);

  if(!r)return;

  raffles.delete(id);

  const g=client.guilds.cache.get(r.guild);
  const c=g?.channels.cache.get(r.channel);

  if(!c)return;

  const arr=[...r.users];

  for(let x=arr.length-1;x>0;x--){
    const j=Math.floor(Math.random()*(x+1));
    [arr[x],arr[j]]=[arr[j],arr[x]];
  }

  const wins=arr.slice(0,r.winners);

  const msg=await c.messages
    .fetch(r.message)
    .catch(()=>null);

  if(msg)
    await msg.edit({
      embeds:[
        new EmbedBuilder()
          .setTitle('🎉 Çekiliş Bitti')
          .setDescription(
`Ödül: **${r.prize}**
Kazananlar: ${
  wins.length
    ? wins.map(x=>`<@${x}>`).join(', ')
    : 'Katılan olmadı.'
}`
          )
      ],
      components:[]
    }).catch(()=>{});
}

client.login(TOKEN);
