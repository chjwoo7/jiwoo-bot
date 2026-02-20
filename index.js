import dotenv from 'dotenv';
import { Client, Collection, Events, GatewayIntentBits, EmbedBuilder, GuildScheduledEventStatus, MessageFlags, Partials } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEventByDiscordId, addParticipant, removeParticipant, getParticipants, archiveEvent, getActiveEvents } from './utils/eventManager.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARCHIVE_CATEGORY_ID = process.env.ARCHIVE_CATEGORY_ID;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildScheduledEvents,
        GatewayIntentBits.GuildPresences,
    ],
    partials: [
        Partials.User,
        Partials.GuildMember,
        Partials.GuildScheduledEvent,
    ]
});

// Load commands
client.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = await import(`file://${filePath}`);

        // Set a new item in the Collection with the key as the command name and the value as the exported module
        if (command.default && 'data' in command.default && 'execute' in command.default) {
            client.commands.set(command.default.data.name, command.default);
            console.log(`[INFO] Loaded command: ${command.default.data.name}`);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}

client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);

    // Sync participants
    try {
        const activeEvents = await getActiveEvents();
        console.log(`[CTF] Syncing participants for ${activeEvents.length} active events...`);

        const guild = await client.guilds.fetch(process.env.GUILD_ID);

        for (const event of activeEvents) {
            try {
                const discordEvent = await guild.scheduledEvents.fetch(event.discord_event_id);
                if (discordEvent) {
                    const subscribers = await discordEvent.fetchSubscribers();
                    for (const [userId, sub] of subscribers) {
                        const username = sub.user ? sub.user.username : 'Unknown';
                        await addParticipant(event.id, userId, username);
                    }
                    console.log(`[CTF] Synced ${subscribers.size} participants for ${event.event_name}`);
                }
            } catch (err) {
                console.error(`[CTF] Failed to sync event ${event.event_name}:`, err.message);
            }
        }
    } catch (error) {
        console.error('[CTF] Error syncing participants:', error);
    }
});

// Handle slash command interactions
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isButton()) {
        if (!interaction.customId.startsWith('join_ctf:')) return;

        const [, eventId, roleId] = interaction.customId.split(':');

        if (!eventId || !roleId) {
            return await interaction.reply({
                content: '❌ Tombol Join CTF tidak valid.',
                flags: MessageFlags.Ephemeral
            });
        }

        if (!interaction.guild || !interaction.member) {
            return await interaction.reply({
                content: '❌ Tombol ini hanya bisa dipakai di server.',
                flags: MessageFlags.Ephemeral
            });
        }

        try {
            const event = await getEventByDiscordId(eventId);

            if (!event || !event.is_active) {
                return await interaction.reply({
                    content: '❌ Event CTF ini sudah tidak aktif.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (event.role_id !== roleId) {
                return await interaction.reply({
                    content: '❌ Tombol Join CTF tidak cocok dengan data event.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const member = await interaction.guild.members.fetch(interaction.user.id);
            const role = await interaction.guild.roles.fetch(roleId);

            if (!role) {
                return await interaction.reply({
                    content: '❌ Role CTF tidak ditemukan.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (member.roles.cache.has(role.id)) {
                return await interaction.reply({
                    content: `✅ Kamu sudah join <@&${role.id}>.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            await member.roles.add(role.id);
            await addParticipant(event.id, interaction.user.id, interaction.user.tag);

            return await interaction.reply({
                content: `✅ Berhasil join CTF! Role <@&${role.id}> sudah dikasih.`,
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            console.error('[CTF] Error handling join button:', error);
            return await interaction.reply({
                content: '❌ Gagal join CTF. Coba lagi bentar lagi ya.',
                flags: MessageFlags.Ephemeral
            });
        }
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    }
});

// Handle user joining scheduled event (clicking "Interested")
client.on(Events.GuildScheduledEventUserAdd, async (scheduledEvent, user) => {
    console.log(`[DEBUG] User ${user.tag} joined event ${scheduledEvent.name}`);
    try {
        const event = await getEventByDiscordId(scheduledEvent.id);

        if (!event) {
            console.log(`[CTF] Event not found in database: ${scheduledEvent.id}`);
            return;
        }

        // Get guild member
        const guild = scheduledEvent.guild;
        const member = await guild.members.fetch(user.id);

        // Assign role
        await member.roles.add(event.role_id);
        console.log(`[CTF] Assigned role ${event.event_slug} to ${user.tag}`);

        // Add to database (or reactivate if they left before)
        await addParticipant(event.id, user.id, user.tag);
        console.log(`[CTF] Added ${user.tag} to participants list`);

    } catch (error) {
        console.error('[CTF] Error handling event user add:', error);
    }
});

// Handle user leaving scheduled event (clicking "Not Interested")
client.on(Events.GuildScheduledEventUserRemove, async (scheduledEvent, user) => {
    try {
        const event = await getEventByDiscordId(scheduledEvent.id);

        if (!event) {
            console.log(`[CTF] Event not found in database: ${scheduledEvent.id}`);
            return;
        }

        // Get guild member
        const guild = scheduledEvent.guild;
        const member = await guild.members.fetch(user.id);

        // Remove role
        await member.roles.remove(event.role_id);
        console.log(`[CTF] Removed role ${event.event_slug} from ${user.tag}`);

        // Mark as left in database (don't delete)
        await removeParticipant(event.id, user.id);
        console.log(`[CTF] Marked ${user.tag} as left`);

    } catch (error) {
        console.error('[CTF] Error handling event user remove:', error);
    }
});

// Handle scheduled event updates (detect completion)
client.on(Events.GuildScheduledEventUpdate, async (oldEvent, newEvent) => {
    try {
        // Check if event just completed
        if (oldEvent.status !== GuildScheduledEventStatus.Completed &&
            newEvent.status === GuildScheduledEventStatus.Completed) {

            console.log(`[CTF] Event completed: ${newEvent.name}`);

            const event = await getEventByDiscordId(newEvent.id);

            if (!event) {
                console.log(`[CTF] Event not found in database: ${newEvent.id}`);
                return;
            }

            // Get all participants (including those who left)
            const allParticipants = await getParticipants(event.id, true);
            const activeParticipants = allParticipants.filter(p => p.status === 'active');
            const leftParticipants = allParticipants.filter(p => p.status === 'left');

            console.log(`[CTF] Found ${activeParticipants.length} active, ${leftParticipants.length} left participants`);

            // Get forum channel
            const forumChannel = await newEvent.guild.channels.fetch(event.channel_id);

            if (forumChannel) {
                // Post participant list
                const participantEmbed = new EmbedBuilder()
                    .setTitle(`📊 ${event.event_name} - Final Participants`)
                    .setDescription(`✅ Active: **${activeParticipants.length}** | ❌ Left: **${leftParticipants.length}**`)
                    .setColor(0xFF6B6B)
                    .setTimestamp();

                // Active participants
                if (activeParticipants.length > 0) {
                    const activeList = activeParticipants
                        .map((p, index) => `${index + 1}. ${p.username}`)
                        .join('\n');

                    const chunks = activeList.match(/[\s\S]{1,1024}/g) || [];
                    chunks.forEach((chunk, index) => {
                        participantEmbed.addFields({
                            name: index === 0 ? '✅ Active Participants' : '\u200b',
                            value: chunk,
                            inline: false
                        });
                    });
                } else {
                    participantEmbed.addFields({
                        name: '✅ Active Participants',
                        value: 'No active participants.',
                        inline: false
                    });
                }

                // Left participants
                if (leftParticipants.length > 0) {
                    const leftList = leftParticipants
                        .map((p, index) => `${index + 1}. ${p.username}`)
                        .join('\n');

                    const chunks = leftList.match(/[\s\S]{1,1024}/g) || [];
                    chunks.forEach((chunk, index) => {
                        participantEmbed.addFields({
                            name: index === 0 ? '❌ Left Participants' : '\u200b',
                            value: chunk,
                            inline: false
                        });
                    });
                }

                // Create thread for participant list
                await forumChannel.threads.create({
                    name: '📊 Final Participant List',
                    message: {
                        embeds: [participantEmbed]
                    }
                });

                console.log(`[CTF] Posted participant list to forum`);

                // Move channel to archive category
                await forumChannel.setParent(ARCHIVE_CATEGORY_ID);
                console.log(`[CTF] Moved forum to archive category`);
            }

            // Remove role from all active participants
            const guild = newEvent.guild;
            for (const participant of activeParticipants) {
                try {
                    const member = await guild.members.fetch(participant.user_id);
                    await member.roles.remove(event.role_id);
                } catch (err) {
                    console.error(`[CTF] Failed to remove role from ${participant.username}:`, err.message);
                }
            }
            console.log(`[CTF] Removed roles from all participants`);

            // Delete role
            try {
                const role = await guild.roles.fetch(event.role_id);
                if (role) {
                    await role.delete(`CTF Event completed: ${event.event_name}`);
                    console.log(`[CTF] Deleted role: ${event.event_slug}`);
                }
            } catch (err) {
                console.error(`[CTF] Failed to delete role:`, err.message);
            }

            // Mark event as archived in database
            await archiveEvent(event.id);
            console.log(`[CTF] Archived event in database`);

            console.log(`[CTF] Cleanup completed for: ${event.event_name}`);
        }

    } catch (error) {
        console.error('[CTF] Error handling event update:', error);
    }
});

client.login(process.env.DISCORD_TOKEN);
