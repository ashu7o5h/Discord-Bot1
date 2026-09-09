const {
    REST,
    Routes,
    SlashCommandBuilder
} = require('discord.js');

require('dotenv').config();


const commands = [

    // /ping
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check if the bot is online'),


    // /activity
    new SlashCommandBuilder()
        .setName('activity')
        .setDescription('Check activity tracking status'),


    // /leaderboard
    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Show the most active members'),


    // /messages
    new SlashCommandBuilder()
        .setName('messages')
        .setDescription('Check how many messages a member has sent')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The member to check')
                .setRequired(true)
        ),


    // /make
    new SlashCommandBuilder()
        .setName('make')
        .setDescription('Create a custom command')
        .addStringOption(option =>
            option
                .setName('command')
                .setDescription('Name of the new command')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('message')
                .setDescription('Message the command should send')
                .setRequired(true)
        ),


    // /delete
    new SlashCommandBuilder()
        .setName('delete')
        .setDescription('Delete a custom command')
        .addStringOption(option =>
            option
                .setName('command')
                .setDescription('Name of the command to delete')
                .setRequired(true)
        ),


    // /customcommands
    new SlashCommandBuilder()
        .setName('customcommands')
        .setDescription('List all custom commands'),

    // /startserver
    new SlashCommandBuilder()
        .setName('startserver')
        .setDescription('Start the Minecraft server'),

].map(command => command.toJSON());


const rest = new REST({ version: '10' })
    .setToken(process.env.DISCORD_TOKEN);


// PUT YOUR ACTUAL IDs HERE
const CLIENT_ID = '1545838717711683704';
const GUILD_ID = '1516795485153788064';


(async () => {

    try {

        console.log('Registering commands...');

        await rest.put(
            Routes.applicationGuildCommands(
                CLIENT_ID,
                GUILD_ID
            ),
            {
                body: commands
            }
        );

        console.log('Commands registered successfully!');

    } catch (error) {

        console.error(error);

    }

})();