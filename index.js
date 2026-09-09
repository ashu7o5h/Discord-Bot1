require('dotenv').config();

const fs = require('fs');
const path = require('path');

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes
} = require('discord.js');

const SERVER_ID = '237d9994-3569-40ac-a0f0-af90c1b60a3d';

async function startMinecraftServer() {
    const res = await fetch(
        `https://api.mcserverhost.com/user/servers/${SERVER_ID}/power`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.MCHOSTS_TOKEN}`,
                'X-Csrf-Token': process.env.MCHOSTS_CSRF,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'start',
                wait_seconds: 0
            })
        }
    );

    const responseText = await res.text();

    if (res.status === 401) {
        throw new Error(
            'Authentication failed (401). Check MCHOSTS_TOKEN and MCHOSTS_CSRF.'
        );
    }

    if (!res.ok) {
        throw new Error(
            `Start failed: ${res.status} ${responseText}`
        );
    }

    try {
        return JSON.parse(responseText);
    } catch {
        return responseText;
    }
}

if (!process.env.ALLOWED_ROLE_IDS) {
    console.error(
        '❌ ALLOWED_ROLE_IDS is missing from your .env file.\n' +
        'Add a line like: ALLOWED_ROLE_IDS=123456789012345678,987654321098765432'
    );
    process.exit(1);
}

const allowedRoleIds = process.env.ALLOWED_ROLE_IDS
    .split(',')
    .map(id => id.trim());

process.on('unhandledRejection', error => {
    console.error('Unhandled rejection:', error);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});


// =====================================================
// FILES
// =====================================================

const dataFolder = path.join(__dirname, 'data');
const activityPath = path.join(dataFolder, 'activity.json');
const customCommandsPath = path.join(__dirname, 'custom_commands.json');


// Create data folder if needed
if (!fs.existsSync(dataFolder)) {
    fs.mkdirSync(dataFolder);
}


// =====================================================
// ACTIVITY DATA
// =====================================================

let activity = {};

if (fs.existsSync(activityPath)) {
    try {
        activity = JSON.parse(
            fs.readFileSync(activityPath, 'utf8')
        );
    } catch {
        activity = {};
    }
}


function saveActivity() {
    fs.writeFileSync(
        activityPath,
        JSON.stringify(activity, null, 2)
    );
}


// =====================================================
// CUSTOM COMMAND DATA
// =====================================================

let customCommands = {};

if (fs.existsSync(customCommandsPath)) {
    try {
        customCommands = JSON.parse(
            fs.readFileSync(customCommandsPath, 'utf8')
        );
    } catch {
        customCommands = {};
    }
}


function saveCustomCommands() {
    fs.writeFileSync(
        customCommandsPath,
        JSON.stringify(customCommands, null, 2)
    );
}

// =====================================================
// DISCORD REST
// =====================================================

const rest = new REST({ version: '10' })
    .setToken(process.env.DISCORD_TOKEN);


// =====================================================
// READY
// =====================================================

client.once('ready', async () => {

    console.log(`Logged in as ${client.user.tag}`);

    console.log('Loading custom commands...');

    // Register /startserver
    try {
        await rest.post(
            Routes.applicationGuildCommands(
                client.user.id,
                process.env.GUILD_ID
            ),
            {
                body: {
                    name: 'startserver',
                    description: 'Start the Minecraft server'
                }
            }
        );

        console.log('Loaded /startserver');

    } catch (error) {
        console.error(
            'Could not load /startserver:',
            error
        );
    }

    // Re-register saved custom commands
    for (const guildId of Object.keys(customCommands)) {

        for (
            const commandName of Object.keys(
                customCommands[guildId]
            )
        ) {

            try {

                await rest.post(
                    Routes.applicationGuildCommands(
                        client.user.id,
                        guildId
                    ),
                    {
                        body: {
                            name: commandName,
                            description:
                                `Custom command: ${commandName}`
                        }
                    }
                );

                console.log(`Loaded /${commandName}`);

            } catch (error) {

                // Command may already exist
                if (error.code !== 40041) {
                    console.log(
                        `Could not load /${commandName}`
                    );
                }
            }
        }
    }

    console.log('Custom commands loaded.');
});


// =====================================================
// SILENT MESSAGE TRACKING
// =====================================================

client.on('messageCreate', message => {

    if (message.author.bot) return;

    if (!message.guild) return;

    const guildId = message.guild.id;
    const userId = message.author.id;

    if (!activity[guildId]) {
        activity[guildId] = {};
    }

    if (!activity[guildId][userId]) {
        activity[guildId][userId] = {
            messages: 0
        };
    }

    activity[guildId][userId].messages++;

    saveActivity();
});


// =====================================================
// SLASH COMMANDS
// =====================================================

client.on('interactionCreate', async interaction => {

    try {
        await handleInteraction(interaction);

    } catch (error) {
        console.error('Interaction error:', error);
    }
});


async function handleInteraction(interaction) {

    if (!interaction.isChatInputCommand()) return;

    const commandName = interaction.commandName;


    // =================================================
    // CUSTOM COMMANDS
    // =================================================

    if (
        customCommands[interaction.guildId] &&
        customCommands[interaction.guildId][commandName]
    ) {

        const message =
            customCommands[interaction.guildId][commandName];

        return interaction.reply({
            content: message
        });
    }


    // =================================================
    // /ping
    // =================================================

    if (commandName === 'ping') {

        const sent = await interaction.reply({
            content: 'Pinging...',
            fetchReply: true
        });

        const roundTrip =
            sent.createdTimestamp -
            interaction.createdTimestamp;

        const wsLatency =
            Math.round(client.ws.ping);

        return interaction.editReply(
            `🏓 **Pong!**\n\n` +
            `📡 **Latency:** ${roundTrip}ms\n` +
            `💓 **WebSocket:** ${wsLatency}ms`
        );
    }


    // =================================================
    // /startserver
    // =================================================

    if (commandName === 'startserver') {

        if (
            !interaction.member.roles.cache.some(
                role => allowedRoleIds.includes(role.id)
            )
        ) {
            return interaction.reply({
                content:
                    '❌ You do not have permission to use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply({
            ephemeral: true
        });

        try {

            const result =
                await startMinecraftServer();

            console.log(
                'Minecraft server start response:',
                result
            );

            return interaction.editReply(
                '🚀 **Minecraft server start request sent successfully!**'
            );

        } catch (error) {

            console.error(
                'Minecraft server start error:',
                error
            );

            return interaction.editReply(
                `❌ **Failed to start the Minecraft server.**\n\n` +
                `\`${error.message}\``
            );
        }
    }


    // =================================================
    // ROLE CHECK
    // =================================================

    if (
        !interaction.member.roles.cache.some(
            role => allowedRoleIds.includes(role.id)
        )
    ) {

        return interaction.reply({
            content:
                '❌ You do not have permission to use this command.',
            ephemeral: true
        });
    }
        // =================================================
    // /activity
    // =================================================

    if (commandName === 'activity') {

        return interaction.reply({
            content:
                '🟢 **Activity Tracking**\n\n' +
                'Status: **ONLINE**\n' +
                'New messages are being counted silently.',
            ephemeral: true
        });
    }


    // =================================================
    // /leaderboard
    // =================================================

    if (commandName === 'leaderboard') {

        const guildData =
            activity[interaction.guild.id] || {};

        const members = Object.entries(guildData)
            .sort((a, b) =>
                b[1].messages - a[1].messages
            )
            .slice(0, 10);

        if (members.length === 0) {

            return interaction.reply({
                content:
                    '📊 No activity has been recorded yet.',
                ephemeral: true
            });
        }

        let result =
            '🏆 **Activity Leaderboard**\n\n';

        members.forEach(([userId, data], index) => {

            result +=
                `**${index + 1}.** <@${userId}> — ` +
                `**${data.messages.toLocaleString()}** messages\n`;
        });

        return interaction.reply({
            content: result,
            ephemeral: true
        });
    }


    // =================================================
    // /messages
    // =================================================

    if (commandName === 'messages') {

        const user =
            interaction.options.getUser('user');

        const guildData =
            activity[interaction.guild.id] || {};

        const userData =
            guildData[user.id];

        const count =
            userData ? userData.messages : 0;

        return interaction.reply({
            content:
                '📊 **Message Statistics**\n\n' +
                `👤 **User:** ${user}\n` +
                `💬 **Messages:** **${count.toLocaleString()}**`,
            ephemeral: true
        });
    }


    // =================================================
    // /make
    // =================================================

    if (commandName === 'make') {

        const name =
            interaction.options.getString('command')
                .toLowerCase();

        const message =
            interaction.options.getString('message');


        // Check command name
        if (!/^[a-z0-9_-]{1,32}$/.test(name)) {

            return interaction.reply({
                content:
                    '❌ Command names can only contain letters, numbers, `_` and `-`, and must be 1–32 characters long.',
                ephemeral: true
            });
        }


        // Prevent overwriting built-in commands
        const builtInCommands = [
            'ping',
            'activity',
            'leaderboard',
            'messages',
            'make',
            'delete',
            'customcommands',
            'startserver'
        ];

        if (builtInCommands.includes(name)) {

            return interaction.reply({
                content:
                    '❌ That command name is reserved by Nest.',
                ephemeral: true
            });
        }


        // Create guild storage
        if (!customCommands[interaction.guildId]) {
            customCommands[interaction.guildId] = {};
        }


        // Save message
        customCommands[interaction.guildId][name] =
            message;

        saveCustomCommands();


        // Register slash command with Discord
        try {

            await rest.post(
                Routes.applicationGuildCommands(
                    client.user.id,
                    interaction.guildId
                ),
                {
                    body: {
                        name: name,
                        description:
                            `Custom command: ${name}`
                    }
                }
            );

        } catch (error) {

            console.error(error);

            return interaction.reply({
                content:
                    '❌ Failed to register the command with Discord.',
                ephemeral: true
            });
        }


        return interaction.reply({
            content:
                `✅ Created **/${name}**!\n\n` +
                `Use **/${name}** to send the custom message.`,
            ephemeral: true
        });
    }


    // =================================================
    // /delete
    // =================================================

    if (commandName === 'delete') {

        const name =
            interaction.options.getString('command')
                .toLowerCase();


        if (
            !customCommands[interaction.guildId] ||
            !customCommands[interaction.guildId][name]
        ) {

            return interaction.reply({
                content:
                    `❌ **/${name}** does not exist.`,
                ephemeral: true
            });
        }


        delete customCommands[interaction.guildId][name];

        saveCustomCommands();


        // Remove command from Discord
        try {

            const commands =
                await rest.get(
                    Routes.applicationGuildCommands(
                        client.user.id,
                        interaction.guildId
                    )
                );

            const command =
                commands.find(cmd => cmd.name === name);

            if (command) {

                await rest.delete(
                    Routes.applicationGuildCommand(
                        client.user.id,
                        interaction.guildId,
                        command.id
                    )
                );
            }

        } catch (error) {

            console.error(error);
        }


        return interaction.reply({
            content:
                `🗑️ Deleted **/${name}**.`,
            ephemeral: true
        });
    }


    // =================================================
    // /customcommands
    // =================================================

    if (commandName === 'customcommands') {

        const guildCommands =
            customCommands[interaction.guildId] || {};

        const names =
            Object.keys(guildCommands);

        if (names.length === 0) {

            return interaction.reply({
                content:
                    '📭 No custom commands have been created yet.',
                ephemeral: true
            });
        }


        let result =
            '⚙️ **Custom Commands**\n\n';

        names.forEach(name => {

            result += `• **/${name}**\n`;
        });


        return interaction.reply({
            content: result,
            ephemeral: true
        });
    }

}


// =====================================================
// LOGIN
// =====================================================

client.login(process.env.DISCORD_TOKEN);