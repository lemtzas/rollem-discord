'use strict';

const util = require("util");


// enable application insights if we have an instrumentation key set up
const appInsights = require("applicationinsights");
if (process.env.APPINSIGHTS_INSTRUMENTATIONKEY) {
  // TODO: This reads all log messages from console. We can probably do better by logging via winston/bunyan.
  appInsights.setup()
      .setAutoDependencyCorrelation(true)
      .setAutoCollectRequests(true)
      .setAutoCollectPerformance(true)
      .setAutoCollectExceptions(true)
      .setAutoCollectDependencies(true)
      .setAutoCollectConsole(true, true)
      .setUseDiskRetryCaching(true)
      .start();
}
/** Will be `undefined` unless appInsights successfully initialized. */
const aiClient = appInsights.defaultClient;
// aiClient.addTelemetryProcessor((envelope, context) => {
//   envelope.data.
//   return true;
// });

const Discord = require('discord.js');
const Rollem = require('./rollem.js');
const moment = require('moment');
const fs = require('fs');

let VERSION = "v1.x.x";

let client = new Discord.Client();


//enmap Config
const Enmap = require('enmap');
const Provider = require('enmap-mongo');
const settings = new Enmap({provider: new Provider({name: "enmap"})});
const defaultSettings = {
  prefix: "&",
  adminRole: "Moderator",
  noSort: false
}

var token = process.env.DISCORD_BOT_USER_TOKEN;
var deferToClientIds = (process.env.DEFER_TO_CLIENT_IDS || '').split(',');

// read the changelog to the last major section that will fit
const CHANGELOG_LINK = "<https://github.com/lemtzas/rollem-discord/blob/master/CHANGELOG.md>\n\n";
var changelog = CHANGELOG_LINK + "(Sorry, we're still reading it from disk.)";
fs.readFile("./CHANGELOG.md", 'utf8', (err, data) => {
  const MAX_LENGTH = 2000 - CHANGELOG_LINK.length;
  const MAX_LINES = 15;
  // error handling
  if (err) {
    console.error(err);
    changelog = CHANGELOG_LINK + "(Sorry, there was an issue reading the file fom disk.) \n\n" + err;
    return;
  }

  // don't go over the max discord message length
  let maxLengthChangelog = data.substring(0, MAX_LENGTH);

  // don't go over a reasonable number of lines
  let reasonableLengthChangeLog = maxLengthChangelog.split("\n").slice(0, MAX_LINES).join("\n");

  // don't show partial sections
  let lastSectionIndex = reasonableLengthChangeLog.lastIndexOf("\n#");
  let noPartialSectionsChangeLog = reasonableLengthChangeLog.substring(0, lastSectionIndex);

  // set the changelog
  changelog = CHANGELOG_LINK + noPartialSectionsChangeLog

  // set the version
  let firstLine = data.substring(0, data.indexOf("\n"));
  let versionMatch = firstLine.match(/\d+(?:\.\d+){2}/i);
  let versionText = versionMatch ? versionMatch[0] : null;
  if (versionText) {
    VERSION = `v${versionText}`;
    cycleMessage();
  }
});

var mentionRegex = /$<@999999999999999999>/i;
var messageInterval = 60 * 1000; // every minute
var messages = [
  () => `${VERSION} - http://rollem.rocks`
];

function cycleMessage() {
  if (client.user) {
    let messageFunc = messages.shift();
    messages.push(messageFunc);
    let message = messageFunc();
    client.user.setStatus("online").catch(error => handleRejection("setStatus", error));
    client.user
      .setActivity(message)
      .catch(error => handleRejection("setActivity", error));
  }
}



client.on('disconnect', (f) => {
  trackEvent("disconnect", { reason: util.inspect(f) });
  if (aiClient) { aiClient.flush(); }
  process.exit(1);
});

client.on('error', (error) => {
  if (error && error.message) {
    let ignoreError = error.message.contains('write EPIPE');
    if (ignoreError) {
      trackEvent("known error - " + error.message, { reason: util.inspect(error)});
      return;
    }
  }

  trackEvent("unknown error", { reason: util.inspect(error) });
  if (aiClient) { aiClient.flush(); }

  process.exit(1);
});

client.on('ready', () => {
  trackEvent("ready");

  console.log('I am ready!');
  cycleMessage();

  console.log("will defer to " + deferToClientIds);
  console.log('username: ' + client.user.username);
  console.log('id: ' + client.user.id);

  setInterval(cycleMessage, messageInterval);
  var mentionRegex_s = '^<@' + client.user.id + '>\\s+';
  mentionRegex = new RegExp(mentionRegex_s);

  sendHeartbeat("startup message");
  sendHeartbeatNextHour();
});
//Verify all guilds have a key. 
client.on("ready", async () => {
  await settings.defer
  // We need to ensure that every single guild has a configuration when we boot. 
  // First loop through all guilds
  client.guilds.forEach(guild => {
    // For this guild, check if enmap has its guild conf
    if(!settings.has(guild.id)) {
       // add it if it's not there, add it!
       settings.set(guild.id, defaultSettings);
    }
  });
});

function sendHeartbeatNextHour() {
  const now = moment();
  const nextHour = moment().endOf('h');
  const msToNextHour = nextHour.diff(now);
  setTimeout(
    () => {
      sendHeartbeat("heartbeat at " + nextHour.toString());
      sendHeartbeatNextHour();
    },
    msToNextHour
  );
}

/** Sends a single heartbeat-info message to owner confirming liveliness. */
function sendHeartbeat(reason) {
  const disableHeartbeat = process.env.DISABLE_HEARTBEAT
  if (disableHeartbeat) { return; }

  trackEvent(`heartbeat - shard ${shardName()}`, {reason: reason});
}


// ping pong in PMs
client.on('message', message => {
  if (message.author.bot) { return; }
  if (message.author == client.user) { return; }
  if (message.guild) { return; }

  if (message.content === 'ping') {
    message.reply('pong').catch(rejected => handleSendRejection(message));
  }
});

// stats and help
client.on('message', message => {
  if (message.author.bot) { return; }
  let content = message.content;

  // ignore without prefix
  var match = content.match(mentionRegex);
  if (message.guild && !match) { return; }
  if (match) {
    content = content.substring(match[0].length).trim();
  }

  // stats and basic help
  if (content.startsWith('stats') || content.startsWith('help')) {
    let guilds = client.guilds.map((g) => g.name);
    let uptime = moment.duration(client.uptime);
    let stats = [
      '',
      `**shard:** ${shardName()}`,
      `**uptime:** ${uptime.days()}d ${uptime.hours()}h ${uptime.minutes()}m ${uptime.seconds()}s`,
      `**servers:** ${client.guilds.size}`,
      `**users:** ${client.users.size}`,
      '',
      'Docs at <http://rollem.rocks>',
      'Try `@rollem changelog`',
      '',
      'Avatar by Kagura on Charisma Bonus.'
    ];
    let response = stats.join('\n');
    message.reply(stats).catch(rejected => handleSendRejection(message));
    trackEvent("stats");
  }

  // changelog
  if (content.startsWith('changelog') ||
    content.startsWith('change log') ||
    content.startsWith('changes') ||
    content.startsWith('diff')) {
    message.reply(changelog).catch(rejected => handleSendRejection(message));
    trackEvent("changelog");
  }
});

// greedy rolling
client.on('message', message => {
  // avoid doing insane things
  if (message.author.bot) { return; }
  if (message.author == client.user) { return; }
  if (shouldDefer(message)) { return; }
  if (message.content.startsWith('D')) { return; } // apparently D8 is a common emote.

  // honor the prefix
  let prefix = getPrefix(message);
  if (!message.content.startsWith(prefix)) { return; }

  // get our actual roll content
  let content = message.content.substring(prefix.length);
  content = content.trim();

  let count = 1;
  let match = content.match(/(?:(\d+)#\s*)?(.*)/);
  let countRaw = match[1];
  if (countRaw) {
    count = parseInt(countRaw);
    if (count > 100) { return; }
    if (count < 1) { return; }
  }

  count = count || 1;
  let contentAfterCount = match[2];

  var lines = [];
  for (let i = 0; i < count; i++) {
    var result = Rollem.tryParse(contentAfterCount);
    if (!result) { return; }

    let shouldReply = prefix || (result.depth > 1 && result.dice > 0); // don't be too aggressive with the replies
    if (!shouldReply) { return; }

    let response = buildMessage(result);

    if (response && shouldReply) {
      lines.push(response);
    }
  }

  if (lines.length > 0) {
    let response = "\n" + lines.join("\n");
    message.reply(response).catch(rejected => handleSendRejection(message));

    if (count === 1) { trackEvent('soft parse'); }
    else { trackEvent('soft parse, repeated'); }

    return;
  }
});

// TODO: Split this up. Combine common bail rules.
// inline and convenience messaging
client.on('message', message => {
  // avoid doing insane things
  if (message.author.bot) { return; }
  if (message.author == client.user) { return; }
  if (shouldDefer(message)) { return; }

  var content = message.content.trim();
  var guildConf = settings.get(message.guild.id);
  // ignore the dice requirement with prefixed strings
  if (content.startsWith(guildConf.prefix) ) {
    var subMessage = content.substring(1);
    var result = Rollem.tryParse(subMessage);
    var response = buildMessage(result, false);
    if (response) {
      if (shouldDefer(message)) { return; }
      message.reply(response).catch(rejected => handleSendRejection(message));
      trackEvent('medium parse');
      return;
    }
  }

  // ignore the dice requirement with name prefixed strings
  var match = content.match(mentionRegex); // TODO: This should override Deferral
  if (match) {
    var subMessage = content.substring(match[0].length);
    var result = Rollem.tryParse(subMessage);
    var response = buildMessage(result, false);
    if (response) {
      if (shouldDefer(message)) { return; }
      message.reply(response).catch(rejected => handleSendRejection(message));
      trackEvent('hard parse');
      return;
    }
  }

  // handle inline matches
  var last = null;
  var matches = [];
  var regex = /\[(.+?)\]/g;
  while (last = regex.exec(content)) { matches.push(last[1]); }

  if (matches && matches.length > 0) {
    var messages = matches.map(function (match) {
      var result = Rollem.tryParse(match);
      var response = buildMessage(result);
      return response;
    }).filter(x => !!x);

    if (messages.length === 0) { return; }

    var fullMessage = '\n' + messages.join('\n');
    if (fullMessage) {
      if (shouldDefer(message)) { return; }
      message.reply(fullMessage).catch(rejected => handleSendRejection(message));
      trackEvent('inline parse');
      return;
    }
  }
});

client.on("guildCreate", guild => {
  // Adding a new row to the collection uses `set(key, value)`
  settings.set(guild.id, defaultSettings);
});

client.on("guildDelete", guild => {
  // Removing an element uses `delete(key)`
  settings.delete(guild.id);
});
//Commands for server based options
client.on('message',message => {
  const guildConf = settings.get(message.guild.id) || defaultSettings;
  if(message.content.indexOf(guildConf.prefix) !== 0) return;
  const args = message.content.split(/\s+/g);
  const command = args.shift().slice(guildConf.prefix.length).toLowerCase();
  //Commands
  if(command === "set"){
    const adminRole = message.guild.roles.find("name", guildConf.adminRole);
    if(!adminRole) return message.reply("Administrator Role Not Found");
    
    // Exit if no mod
    if(!message.member.roles.has(adminRole.id)) return message.reply("You're not an admin, sorry!")
    
    // Get key and value from args
    var [key, ...value] = args;
    //verify key is valid.
        //Check for boolean if noSort key
        if(key.toLowerCase() === "nosort" ){
          //Sanity so user doesnt have to use correct casing
          key = "noSort";
          if(value.toString().toLowerCase() === 'true' || value.toString().toLowerCase() === 'false'){}
          else {return message.reply(`\`${key}\` value must be true or false`); }
        } 
    if(!settings.hasProp(message.guild.id, key))  return message.reply("This key is not in the configuration.");
    
 
   
    //Finally set the value.
    settings.setProp(message.guild.id, key, value.join(" "));

    //confirm to client.
    message.channel.send(`Guild configuration item ${key} has been changed to:\n\`${value.join(" ")}\``);
  }


  if(command === "showconfig") {
    let configKeys = "";
    Object.keys(guildConf).forEach(key => {
      configKeys += `${key}  :  ${guildConf[key]}\n`;
    });
    message.channel.send(`The following are the server's current configuration: \`\`\`${configKeys}\`\`\``);
  }

});

function getRelevantRoleNames(message, prefix) {
  if (!message.guild) { return []; }
  let me = message.guild.members.get(client.user.id);
  let roleNames = me.roles.map(r => r.name);
  let roles = roleNames.filter(rn => rn.startsWith(prefix));
  return roles;
}

function getPrefix(message) {
  let prefixRolePrefix = 'rollem:prefix:';
  let prefixRoles = getRelevantRoleNames(message, prefixRolePrefix);
  if (prefixRoles.length == 0) { return ""; }
  let prefix = prefixRoles[0].substring(prefixRolePrefix.length);
  return prefix;
}

function shouldDefer(message) {
  if (!message.guild) { return false; }
  if (!message.channel || !message.channel.members) { return false; }

  let members = message.channel && message.channel.members;
  if (!members) { return false; }

  let deferToMembers =
    deferToClientIds.filter(id => {
      let member = members.get(id);
      let isOnline = member && member.presence && member.presence.status == 'online';
      return isOnline;
    }).map(id => members.get(id));

  if (deferToMembers.length > 0) {
    let names = deferToMembers.map(member => `${member.user.username} (${member.user.id})`).join(", ");
    trackEvent('deferral to ' + names);
    return true;
  }

  return false;
}

function buildMessage(result, requireDice = true) {
  if (result === false) { return false; }
  if (typeof (result) === "string") { return result; }
  if (result.depth <= 1) { return false; }
  if (requireDice && result.dice < 1) { return false; }

  var response = "";

  if (result.label && result.label != "") {
    response += "'" + result.label + "', ";
  }
  if (typeof (result.value) === "boolean") {
    result.value = result.value ? "**Success!**" : "**Failure!**";
  }

  response += result.value + ' ⟵ ' + result.pretties;

  return response;
}

/** Constructs a human-readable string identifying this shard. */
function shardName() {
  return client.shard
    ? `${client.shard.id+1} of ${client.shard.count}`
    : "only";
}

/** Constructs a one-index string identifying this shard. */
function shardId() {
  return client.shard
    ? client.shard.id + 1
    : 1;
}

/** Safely retrieves the shard count. */
function shardCount() {
  return client.shard
    ? client.shard.count
    : 1;
}

/** Adds common AI properties to the given object (or creates one). Returns the given object. */
function enrichAIProperties(object = {}) {
  object["Shard Name"] = ''+shardName();
  object["Client ID"] = ''+client.user.id;
  object["Client Name"] = ''+client.user.username;
  object["Version"] = ''+VERSION;
  return object;
}

/** Adds common AI metrics to the given object (or creates one). Returns the given object. */
function enrichAIMetrics(object = {}) {
  object['Servers (per shard)'] = client.guilds.size;
  object['Users (per shard)'] = client.users.size;
  object['Uptime (minutes)'] = client.uptime / 1000 / 60;
  object['Shard Count'] = shardCount();
  object['Shard ID'] = shardId();
  return object;
}

/** Tracks an event with AI using a console fallback. */
// TODO: Convert many of the operations to use trackRequest instead. See https://docs.microsoft.com/en-us/azure/application-insights/app-insights-api-custom-events-metrics#trackrequest
function trackEvent(name, properties = {}) {
  if (aiClient) {
    aiClient.trackEvent({
      name: name,
      measurements: enrichAIMetrics(),
      properties: enrichAIProperties(properties)
    });
  } else {
    console.log(name, properties);
  }
}

/** Tracks a metric with AI using a console fallback. */
function trackMetric(name, value) {
  if (aiClient) {
    aiClient.trackMetric({
      name: name,
      value: value
    });
  } else {
    // oblivion
  }
}

function handleRejection(label, error) {
  // let guildId = message.guild ? message.guild.id : null;
  // let channelId = message.channel ? message.channel.id : null;
  // let messageId = message.id;
  // let userId = message.userId;
  if (aiClient) {
    aiClient.trackException({
      exception: error,
      properties: {
        error: util.inspect(error),
        label: label,
      }
    });
  }
}

function handleSendRejection(message) {
  // let guildId = message.guild ? message.guild.id : null;
  // let channelId = message.channel ? message.channel.id : null;
  // let messageId = message.id;
  // let userId = message.userId;
  trackEvent("Missing send permission");
}


client.login(token);