import { SlashCommandBuilder, EmbedBuilder, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel, MessageFlags, ChannelType, PermissionFlagsBits } from 'discord.js';
import dotenv from 'dotenv';
import { slugify } from '../../utils/slugify.js';
import { createEvent } from '../../utils/eventManager.js';

dotenv.config();

// Support multiple admin roles
const ADMIN_ROLE_IDS = ['1402615202112995418', '1405007847162642452'];
const BOT_CHAT_CHANNEL_ID = process.env.BOT_CHAT_CHANNEL_ID || '1458725882410565815';
const ACTIVE_CTF_CATEGORY_ID = process.env.ACTIVE_CTF_CATEGORY_ID;

export default {
    data: new SlashCommandBuilder()
        .setName('ctf-event')
        .setDescription('Create a CTF event with scheduled event, role, and forum channel')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('CTF event name (e.g., PascalCTF 2026)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('start_date')
                .setDescription('Start date/time in format DD/MM/YYYY HH:MM (WIB timezone)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('end_date')
                .setDescription('End date/time in format DD/MM/YYYY HH:MM (WIB timezone)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('url')
                .setDescription('Official CTF URL')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('team_name')
                .setDescription('Team name')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('team_password')
                .setDescription('Team password')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('invite_link')
                .setDescription('Team invite link')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to post announcement (defaults to bot-chat)')
                .setRequired(false)),

    async execute(interaction) {
        // Check if user has any of the admin roles
        const hasAdminRole = ADMIN_ROLE_IDS.some(roleId =>
            interaction.member.roles.cache.has(roleId)
        );

        if (!hasAdminRole) {
            return await interaction.reply({
                content: '❌ You do not have permission to use this command. Admin role required.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // Get command options
            const name = interaction.options.getString('name');
            const startDateStr = interaction.options.getString('start_date');
            const endDateStr = interaction.options.getString('end_date');
            const url = interaction.options.getString('url');
            const teamName = interaction.options.getString('team_name');
            const teamPassword = interaction.options.getString('team_password');
            const inviteLink = interaction.options.getString('invite_link');
            const channel = interaction.options.getChannel('channel');

            // Parse dates (DD/MM/YYYY HH:MM format, WIB timezone)
            const startDate = parseWIBDate(startDateStr);
            const endDate = parseWIBDate(endDateStr);

            if (!startDate || !endDate) {
                return await interaction.editReply({
                    content: '❌ Invalid date format. Please use DD/MM/YYYY HH:MM format.\nExample: 31/01/2026 15:00'
                });
            }

            if (endDate <= startDate) {
                return await interaction.editReply({
                    content: '❌ End date must be after start date.'
                });
            }

            // Check if start date is in the past
            const now = new Date();
            if (startDate < now) {
                return await interaction.editReply({
                    content: '❌ Woy CTF nya udah lewat bjir, apa lu salah tanggal?\nPakai tanggal yang bener dong! 📅'
                });
            }

            // Generate slug for role and channel names
            const eventSlug = slugify(name);

            // Create role
            const role = await interaction.guild.roles.create({
                name: eventSlug,
                color: 0xFF6B6B, // Red color for CTF
                reason: `CTF Event: ${name}`,
                mentionable: true
            });

            console.log(`[CTF] Created role: ${role.name} (${role.id})`);

            // Create forum channel in active CTF category
            const forumChannel = await interaction.guild.channels.create({
                name: eventSlug,
                type: ChannelType.GuildForum,
                parent: ACTIVE_CTF_CATEGORY_ID,
                reason: `CTF Event: ${name}`,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id, // @everyone
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: role.id, // CTF role
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.CreatePublicThreads,
                            PermissionFlagsBits.SendMessagesInThreads,
                            PermissionFlagsBits.ReadMessageHistory
                        ]
                    }
                ]
            });

            console.log(`[CTF] Created forum channel: ${forumChannel.name} (${forumChannel.id})`);

            // Create Discord scheduled event (password excluded from description)
            const eventDescription = buildEventDescription(url, teamName, inviteLink);

            const scheduledEvent = await interaction.guild.scheduledEvents.create({
                name: name,
                scheduledStartTime: startDate,
                scheduledEndTime: endDate,
                privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
                entityType: GuildScheduledEventEntityType.External,
                entityMetadata: {
                    location: url || 'CTF Platform'
                },
                description: eventDescription
            });

            console.log(`[CTF] Created scheduled event: ${scheduledEvent.name} (${scheduledEvent.id})`);

            // Save to database
            await createEvent({
                discordEventId: scheduledEvent.id,
                eventName: name,
                eventSlug: eventSlug,
                roleId: role.id,
                channelId: forumChannel.id,
                startTime: startDate,
                endTime: endDate
            });

            console.log(`[CTF] Saved event to database`);

            // Post welcome message in forum channel
            const welcomeEmbed = new EmbedBuilder()
                .setTitle(`🚩 Welcome to ${name}!`)
                .setDescription(`This forum is dedicated to the **${name}** CTF event.\n\nUse this space to collaborate, share writeups, and discuss challenges!\n\n**📜 Rules:**\n❌ Do not cheat\n❌ Do not share flags`)
                .setColor(0xFF6B6B)
                .addFields(
                    { name: '📅 Event Period', value: formatDateRange(startDate, endDate), inline: false }
                )
                .setTimestamp();

            if (url) {
                welcomeEmbed.addFields({ name: '🔗 Official URL', value: url, inline: false });
            }

            if (teamName) {
                welcomeEmbed.addFields({ name: '👥 Team Name', value: teamName, inline: true });
            }

            if (teamPassword) {
                welcomeEmbed.addFields({ name: '🔐 Team Password', value: `||${teamPassword}||`, inline: true });
            }

            if (inviteLink) {
                welcomeEmbed.addFields({ name: '📨 Invite Link', value: inviteLink, inline: false });
            }

            // Create initial thread in forum as welcome post
            const welcomeThread = await forumChannel.threads.create({
                name: '📌 Event Information & Guidelines',
                message: {
                    embeds: [welcomeEmbed]
                }
            });

            // Pin the welcome thread
            await welcomeThread.setLocked(true);

            // Create announcement embed
            const embed = new EmbedBuilder()
                .setTitle(`🚩 ${name}`)
                .setDescription(formatDateRange(startDate, endDate))
                .setColor(0xFF6B6B)
                .setTimestamp();

            if (url) {
                embed.addFields({ name: '🔗 Official URL', value: url, inline: false });
            }

            if (teamName) {
                embed.addFields({ name: '👥 Team Name', value: teamName, inline: true });
            }





            embed.addFields(
                { name: '📅 Event', value: `[View Event](${scheduledEvent.url})`, inline: false },
                { name: '💬 Forum', value: `<#${forumChannel.id}>`, inline: false },
                { name: '🎭 Role', value: `<@&${role.id}> - Click "Interested" on the event to get access!`, inline: false }
            );

            // Post announcement to specified channel or default
            const targetChannel = channel || interaction.guild.channels.cache.get(BOT_CHAT_CHANNEL_ID);

            if (!targetChannel) {
                return await interaction.editReply({
                    content: '❌ Could not find the target channel to post announcement.'
                });
            }

            await targetChannel.send({ embeds: [embed] });

            // Success response
            await interaction.editReply({
                content: `✅ CTF event created successfully!\n\n📅 **Event:** ${scheduledEvent.url}\n💬 **Forum:** <#${forumChannel.id}>\n🎭 **Role:** <@&${role.id}>\n📢 **Announcement posted in:** ${targetChannel}`
            });

        } catch (error) {
            console.error('[CTF] Error creating CTF event:', error);

            let errorMessage = '❌ Failed to create CTF event.';

            if (error.code === 50013) {
                errorMessage += '\n\n**Missing Permissions:** The bot needs `MANAGE_EVENTS`, `MANAGE_ROLES`, and `MANAGE_CHANNELS` permissions.';
            } else if (error.message) {
                errorMessage += `\n\n**Error:** ${error.message}`;
            }

            await interaction.editReply({ content: errorMessage });
        }
    },
};

/**
 * Parse date string in DD/MM/YYYY HH:MM format (WIB timezone) to UTC Date object
 */
function parseWIBDate(dateStr) {
    try {
        const regex = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/;
        const match = dateStr.match(regex);

        if (!match) return null;

        const [, day, month, year, hour, minute] = match;

        // Create date in WIB timezone (UTC+7)
        // Parse as UTC first, then subtract 7 hours to get the correct UTC time
        const dateString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00.000+07:00`;
        const date = new Date(dateString);

        return date;
    } catch (error) {
        return null;
    }
}

/**
 * Format date range for display (in WIB)
 */
function formatDateRange(startDate, endDate) {
    const options = {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Jakarta',
        timeZoneName: 'short'
    };

    const startStr = startDate.toLocaleString('en-US', options);
    const endStr = endDate.toLocaleString('en-US', options);

    return `**${startStr}** — **${endStr}**`;
}

/**
 * Build event description with team details (password excluded - only in forum)
 */
function buildEventDescription(url, teamName, inviteLink) {
    let description = '';

    if (url) {
        description += `🔗 Official URL: ${url}\n\n`;
    }

    if (teamName || inviteLink) {
        description += '**Team Information:**\n';

        if (teamName) {
            description += `👥 Team Name: ${teamName}\n`;
        }


        description += '\n🔐 Team Password & Invite Link are available in the forum channel';
    }

    return description || 'CTF Competition Event';
}
