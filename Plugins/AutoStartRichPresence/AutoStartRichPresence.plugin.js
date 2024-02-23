/**
 * @name AutoStartRichPresence
 * @version 2.0.11
 *
 * @author Miniontoby
 * @authorId 849180136828960799
 * @description Auto starts Rich Presence with configurable settings.
 *
 * @updateUrl https://raw.githubusercontent.com/Miniontoby/MinionBDStuff/main/Plugins/AutoStartRichPresence/AutoStartRichPresence.plugin.js
 * @source https://raw.githubusercontent.com/Miniontoby/MinionBDStuff/main/Plugins/AutoStartRichPresence/AutoStartRichPresence.plugin.js
 * @website https://raw.githubusercontent.com/Miniontoby/MinionBDStuff/main/Plugins/AutoStartRichPresence/
 */

// Updated February 23th, 2024

/*@cc_on
@if (@_jscript)
    // Offer to self-install for clueless users that try to run this directly.
    var shell = WScript.CreateObject("WScript.Shell");
    var fs = new ActiveXObject("Scripting.FileSystemObject");
    var pathPlugins = shell.ExpandEnvironmentStrings("%APPDATA%\\BetterDiscord\\plugins");
    var pathSelf = WScript.ScriptFullName;
    // Put the user at ease by addressing them in the first person
    shell.Popup("It looks like you mistakenly tried to run me directly. (don't do that!)", 0, "I'm a plugin for BetterDiscord", 0x30);
    if (fs.GetParentFolderName(pathSelf) === fs.GetAbsolutePathName(pathPlugins)) {
        shell.Popup("I'm in the correct folder already.\nJust reload Discord with Ctrl+R.", 0, "I'm already installed", 0x40);
    } else if (!fs.FolderExists(pathPlugins)) {
        shell.Popup("I can't find the BetterDiscord plugins folder.\nAre you sure it's even installed?", 0, "Can't install myself", 0x10);
    } else if (shell.Popup("Should I copy myself to BetterDiscord's plugins folder for you?", 0, "Do you need some help?", 0x34) === 6) {
        fs.CopyFile(pathSelf, fs.BuildPath(pathPlugins, fs.GetFileName(pathSelf)), true);
        // Show the user where to put plugins in the future
        shell.Exec("explorer " + pathPlugins);
        shell.Popup("I'm installed!\nJust reload Discord with Ctrl+R.", 0, "Successfully installed", 0x40);
    }
    WScript.Quit();
@else @*/

const defaultSettings = {
	clientID: "1012465934088405062",
	disableWhenActivity: false,
	enableStartTime: true,
	name: "",
	details: "",
	state: "",
	button1Label: "",
	button1URL: "",
	button2Label: "",
	button2URL: "",
	smallImageKey: "",
	smallImageText: "",
	largeImageKey: "",
	largeImageText: "",
	listeningTo: false,
};

function isURL(url) {
    try {
        new URL(url);
        return true;
    } catch (e) {
        return false;
    }
}

class AutoStartRichPresence {
    constructor() {
        this.initialized = false;
        this.settings = {};
        this.startPlaying = Date.now();
        this.updateDataInterval = 0;
        this.rpc = {};

        let filter = BdApi.Webpack.Filters.byStrings("getAssetImage: size must === [number, number] for Twitch");
        let assetManager = BdApi.Webpack.getModule(m => typeof m === "object" && Object.values(m).some(filter));
        let getAsset;
        for (const key in assetManager) {
            const member = assetManager[key];
            if (member.toString().includes("APPLICATION_ASSETS_FETCH")) { // find the fetchAssetIds
                getAsset = member;
                break;
            }
        }
        this.getAsset = async key => {
            if (getAsset) return (await getAsset(this.settings.clientID, [key, undefined]))[0];
            else return "";
        };
    }
    async start() {
        this.initialize();
    }
    initialize() {
        console.log("Starting AutoStartRichPresence");
        BdApi.showToast("AutoStartRichPresence has started!");
        this.updateDataInterval = setInterval(() => this.updateData(), 60*1000); // every 60 seconds
        this.settings = BdApi.loadData("AutoStartRichPresence", "settings") || {};
        for (const setting of Object.keys(defaultSettings)) {
            if (typeof this.settings[setting] === "undefined") this.settings[setting] = defaultSettings[setting];
            this.updateSettings();
        }
        this.getLocalPresence = BdApi.findModuleByProps("getLocalPresence").getLocalPresence;
        this.rpc = BdApi.findModuleByProps("dispatch", "_subscriptions");
        this.rpcClientInfo = {};
        this.discordSetActivityHandler = null;
        this.updateRichPresence();
        this.initialized = true;
        this.request = require("request");
    }
    async stop() {
        clearInterval(this.updateDataInterval);
        this.updateDataInterval = 0;
        this.initialized = false;
        this.setActivity({});
        BdApi.showToast("AutoStartRichPresence is stopping!");
    }
    getSettingsPanel() {
        if (!this.initialized) return;
        this.settings = BdApi.loadData("AutoStartRichPresence", "settings") || {};
        const panel = document.createElement("form");
        panel.classList.add("form");
        panel.style.setProperty("width", "100%");
        panel.appendChild(this.generateSettings());
        return panel;
    }
    async updateData() {
        if (!this.initialized) return;

        if(this.settings.disableWhenActivity) {
            const activities = this.getLocalPresence().activities;
            if(activities.filter(a => a.application_id !== this.settings.ClientID).length) {
                if(activities.find(a => a.application_id === this.settings.ClientID)) this.setActivity({});
                return;
            }
        }
        setTimeout(() => this.updateRichPresence(), 50);
    }
    createInput(label, description, type, classname, extrat='text') {
        let out = `<b>${label}</b><br><span>${description}</span><br><br>`;
        if (type == 'onoff') out += `<select class="${classname} inputDefault-Ciwd-S input-3O04eu" style="width:80%;color:inherit"><option value="false">OFF</option><option value="true">ON</option></select>`;
        if (type == 'input') out += `<input class="${classname} inputDefault-Ciwd-S input-3O04eu" placeholder="${label}" style="width:80%;color:inherit" type="${extrat}">`;
        return out + '<br><br>';
    }
    generateSettings() {
        this.settings = BdApi.loadData("AutoStartRichPresence", "settings") || {};
        let template = document.createElement("template");
        template.innerHTML = `<div style="color:var(--header-primary);font-size:16px;font-weight:300;line-height:22px;max-width:550px;margin-top:17px;">
${this.createInput('Client ID', 'Enter your Client ID (get from developers page) [needed for image keys]', 'input', 'clientID', 'text')}
${this.createInput('Activity Name', 'Enter a name for the activity', 'input', 'name')}
${this.createInput('Activity Details', 'Enter a description for the activity', 'input', 'details')}
${this.createInput('Activity State', 'Enter a second description for the activity', 'input', 'state')}
${this.createInput('Activity Button 1 Text', 'Enter Text for button 1', 'input', 'button1Label')}
${this.createInput('Activity Button 1 URL', 'Enter URL for button 1', 'input', 'button1URL')}
${this.createInput('Activity Button 2 Text', 'Enter Text for button 2', 'input', 'button2Label')}
${this.createInput('Activity Button 2 URL', 'Enter URL for button 2', 'input', 'button2URL')}
${this.createInput('Activity Small Image Key', 'Enter Image Key for Small Icon', 'input', 'smallImageKey')}
${this.createInput('Activity Small Image Text', 'Enter Label for Small Icon', 'input', 'smallImageText')}
${this.createInput('Activity Large Image Key', 'Enter Image Key for Large Icon', 'input', 'largeImageKey')}
${this.createInput('Activity Large Image Text', 'Enter Label for Large Icon', 'input', 'largeImageText')}
${this.createInput('Enable Start Time', 'Enable timestamp which shows the time when started', 'onoff', 'enableStartTime')}
${this.createInput('Listening Status', 'Enable listening status', 'onoff', 'listeningTo')}
${this.createInput('Disable When Activity', 'Disables when there is another activity', 'onoff', 'disableWhenActivity')}
</div>`;
        let updateSetting = (e, setting) => {
            this.settings[setting] = e.target.value;
            this.updateSettings();
        }
        const TextInputs = ["clientID", "name", "details", "state", "button1Label", "button1URL", "button2Label", "button2URL", "smallImageKey", "smallImageText", "largeImageKey", "largeImageText"];
        for (const setting of TextInputs) {
            const el = template.content.firstElementChild.getElementsByClassName(setting)[0];
            el.value = this.settings[setting] ?? "";
            el.onchange = (e) => updateSetting(e, setting);
            el.onpaste = (e) => updateSetting(e, setting);
            el.onkeydown = (e) => updateSetting(e, setting);
        }
        const OnOffInputs = ["enableStartTime", "listeningTo", "disableWhenActivity"];
        for (const setting of OnOffInputs) {
            const el = template.content.firstElementChild.getElementsByClassName(setting)[0];
            el.value = this.settings[setting] ? "true" : "false";
            el.onchange = () => {
                this.settings[setting] = el.value === "true";
                this.updateSettings();
            };
        }
        return template.content.firstElementChild;
    }
    setActivity(activity) {
        let obj = activity && Object.assign(activity, { flags: 1, type: this.settings.listeningTo ? 2 : 0 });
        console.log(obj);
        this.rpc.dispatch({
            type: "LOCAL_ACTIVITY_UPDATE",
            activity: obj
        });
    }
    async updateRichPresence() {
        if (this.paused) {
            return;
        }
        let button_urls = [], buttons = [];
        if(this.settings.button1Label != "" && this.settings.button1URL != "" && isURL(this.settings.button1URL)) {
            buttons.push(this.settings.button1Label);
            button_urls.push(this.settings.button1URL);
        }
        if(this.settings.button2Label != "" && this.settings.button2URL != "" && isURL(this.settings.button2URL)) {
            buttons.push(this.settings.button2Label);
            button_urls.push(this.settings.button2URL);
        }
        if (this.settings.enableStartTime) {
            if (this.startPlaying == null) this.startPlaying = Date.now();
        } else if (this.startPlaying) this.startPlaying = null;

        let obj = {
            application_id: this.settings.clientID ?? "1012465934088405062",
            name: this.settings.name || undefined,
            details: this.settings.details || undefined,
            state: this.settings.state || undefined,
            timestamps: { start: this.startPlaying ? Math.floor(this.startPlaying / 1000) : undefined },
            assets: (this.settings.smallImageKey && this.settings.smallImageKey != "") ? {
                small_image: await this.getAsset(this.settings.smallImageKey),
                small_text: this.settings.smallImageText ?? undefined,
            } : {},
            metadata: { button_urls }, buttons
        }
        if(this.settings.largeImageKey && this.settings.largeImageKey != "") {
            obj.assets.large_image = await this.getAsset(this.settings.largeImageKey);
            obj.assets.large_text = this.settings.largeImageText ?? undefined;
        }
        this.setActivity(obj);
    }
    
    updateSettings() {
        BdApi.saveData("AutoStartRichPresence", "settings", this.settings);
        this.updateData(); // will return when not initialized
    }
}

module.exports = AutoStartRichPresence;

/*@end @*/
