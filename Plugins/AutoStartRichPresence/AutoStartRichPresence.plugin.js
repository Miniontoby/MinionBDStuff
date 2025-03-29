/**
 * @name AutoStartRichPresence
 * @version 2.0.15
 *
 * @author Miniontoby
 * @authorId 849180136828960799
 * @description Auto starts Rich Presence with configurable settings.
 *
 * @updateUrl https://raw.githubusercontent.com/Miniontoby/MinionBDStuff/main/Plugins/AutoStartRichPresence/AutoStartRichPresence.plugin.js
 * @source https://raw.githubusercontent.com/Miniontoby/MinionBDStuff/main/Plugins/AutoStartRichPresence/AutoStartRichPresence.plugin.js
 * @website https://github.com/Miniontoby/MinionBDStuff/tree/main/Plugins/AutoStartRichPresence/
 */

// Updated March 29th, 2025

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


const config = {
    changelog: [
        {
            title: "Update 2.0.15 - March 29th, 2025",
            type: "updated",
            items: [
                "Upgraded to newer BD 1.11.0 version",
                "Added changelog"
            ]
        },
    ],
    // config is not static, but dynamic. Not specified here.
};


function isURL(url) {
    try {
        const newUrl = new URL(url);
        return newUrl.protocol === 'http:' || newUrl.protocol === 'https:';
    } catch (e) {
        return false;
    }
}

class AutoStartRichPresence {
    constructor(meta) {
        this.meta = meta;
        this.api = new BdApi(this.meta.name);

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
            if (getAsset && this.activeProfile.clientID) return (await getAsset(this.activeProfile.clientID, [key, undefined]))[0];
            else return "";
        };
    }
    async start() {
        this.initialize();

        const savedVersion = this.api.Data.load("version");
        if (savedVersion !== this.meta.version) {
            this.api.UI.showChangelogModal({
                title: this.meta.name,
                subtitle: this.meta.version,
                blurb: "Automatic customizable rich presence status plugin",
                changes: config.changelog
            });
            this.api.Data.save("version", this.meta.version);
        }
    }
    initialize() {
        console.log("Starting AutoStartRichPresence");
        BdApi.showToast("AutoStartRichPresence has started!");
        this.updateDataInterval = setInterval(() => this.updateData(), 60*1000); // every 60 seconds

        this.settings = this.api.Data.load("settings") || {};
        if (this.settings.clientID || this.settings.details || this.settings.state) this.migrateData();

        this.profiles = this.api.Data.load("profiles") || [];
        if (!this.settings.activeProfileID && this.profiles.length) this.settings.activeProfileID = 0;

        this.getLocalPresence = BdApi.findModuleByProps("getLocalPresence").getLocalPresence;
        this.rpc = BdApi.findModuleByProps("dispatch", "_subscriptions");
        this.rpcClientInfo = {};
        this.discordSetActivityHandler = null;
        this.initialized = true;
        this.updateData();
    }
    async stop() {
        clearInterval(this.updateDataInterval);
        this.updateDataInterval = 0;
        this.initialized = false;
        this.setActivity({});
        BdApi.showToast("AutoStartRichPresence is stopping!");
    }
    get activeProfile() {
        if (!this.profiles?.length || this.profiles?.length == 0) return {};
        return this.profiles[this.settings.activeProfileID];
    }
    getSettingsPanel() {
        if (!this.initialized) return;
        this.settings = this.api.Data.load("settings") || {};
        this.profiles = this.api.Data.load("profiles") || [];

        const settings = [
            {
                type: "dropdown",
                id: "ASRPActiveProfileSelector",
                name: "Select Active Profile",
                note: "With this plugin you can have multiple presets.",
                value: this.settings.activeProfileID,
                options: this.profiles.map((prof, i) => { return { value: i, label: prof.pname }; }),
            },
            { type: "switch", id: "disableWhenActivity", name: "Disable When Activity", note: "Disables when there is another activity", value: this.settings.disableWhenActivity },
            {
                type: "button",
                id: "createProfile",
                children: "Create New Profile",
                note: "Close and reopen the settings window afterwards!",
                inline: false,
                onClick: () => {
                    this.profiles.push({ pname: "New Profile" });
                    if (this.profiles.length === 1) this.settings.activeProfileID = 0;
                    this.updateProfiles();
                    BdApi.showToast("[AutoStartRichPresence] Created a new profile", { type: "success" });
                },
            },
        ];
        for (const i in this.profiles) {
            const profile = this.profiles[i];
            settings.push({
                type: "category",
                id: "profile_" + i,
                name: "Edit Profile - " + profile.pname,
                collapsible: true,
                shown: false,
                settings: [
                    { type: "text", id: "pname", name: "Profile Name", note: "Enter a profile name (this doesn't show up on discord!) [Close and reopen the settings menu afterwards!]", value: profile.pname },
                    { type: "text", id: "clientID", name: "Client ID", note: "Enter your Client ID (get from developers page) [needed for image keys]", value: profile.clientID },
                    { type: "text", id: "name", name: "Activity Name", note: "Enter a name for the activity", value: profile.name },
                    { type: "text", id: "details", name: "Activity Details", note: "Enter a description for the activity", value: profile.details },
                    { type: "text", id: "state", name: "Activity State", note: "Enter a second description for the activity", value: profile.state },
                    { type: "text", id: "button1Label", name: "Activity Button 1 Text", note: "Enter Text for button 1", value: profile.button1Label },
                    { type: "text", id: "button1URL", name: "Activity Button 1 URL", note: "Enter URL for button 1", value: profile.button1URL },
                    { type: "text", id: "button2Label", name: "Activity Button 2 Text", note: "Enter Text for button 2", value: profile.button2Label },
                    { type: "text", id: "button2URL", name: "Activity Button 2 URL", note: "Enter URL for button 2", value: profile.button2URL },
                    { type: "text", id: "smallImageKey", name: "Activity Small Image Key", note: "Enter Image Key for Small Icon", value: profile.smallImageKey },
                    { type: "text", id: "smallImageText", name: "Activity Small Image Text", note: "Enter Label for Small Icon", value: profile.smallImageText },
                    { type: "text", id: "largeImageKey", name: "Activity Large Image Key", note: "Enter Image Key for Large Icon", value: profile.largeImageKey },
                    { type: "text", id: "largeImageText", name: "Activity Large Image Text", note: "Enter Label for Large Icon", value: profile.largeImageText },
                    { type: "switch", id: "enableStartTime", name: "Enable Start Time", note: "Enable timestamp which shows the time when started", value: profile.enableStartTime },
                    { type: "switch", id: "listeningTo", name: "Listening Status", note: "Enable listening status", value: profile.listeningTo },
                    {
                        type: "button",
                        id: "deleteProfile",
                        children: "Delete Profile",
                        note: "Close and reopen the settings window after!",
                        inline: false,
                        onClick: () => {
                            const profileID = i;
                            if (profileID >= this.profiles.length) return console.log("profileSettings too high ID", profileID, id, value);
                            BdApi.showConfirmationModal("Delete Rich Presence Profile", `Are you sure you want to delete ${this.profiles[profileID]?.pname || "this profile"}? (This will not delete any Discord Developer Applications.)`, {
                                danger: true,
                                confirmText: "Delete",
                                onConfirm: () => {
                                    this.deleteProfile(profileID);
                                    this.updateProfiles();
                                    BdApi.showToast("[AutoStartRichPresence] Deleted profile", { type: "success" });
                                }
                            });
                        },
                        color: BdApi.Components.Button.Colors.RED,
                    },
                ],
            });
        }

        return BdApi.UI.buildSettingsPanel({
            settings: settings,
            onChange: (category, id, value) => {
                if (category === null) {
                    if (id === "ASRPActiveProfileSelector") {
                        if (isNaN(value)) return;
                        this.settings.activeProfileID = value;
                        this.updateSettings();
                    } else if (id === "disableWhenActivity") {
                        if (value !== true && value !== false) return;
                        this.settings.disableWhenActivity = value;
                        this.updateSettings();
                    } else {
                        console.log("globalSettings UNKNOWN ID", id, value);
                    }
                } else if (category.startsWith("profile_")) {
                    const profileID = Number(category.replace("profile_", ""));
                    if (isNaN(profileID)) return console.log("profileSettings NOT A NUMBER", category, profileID, id, value);
                    if (profileID >= this.profiles.length) return console.log("profileSettings too high ID", profileID, id, value);
                    //if (!(id in this.profiles[profileID])) return console.log("profileSettings", profileID, "UNKNOWN ID", id, value);
                    this.profiles[profileID][id] = value;
                } else {
                    console.log("UNKNOWN CATEGORY", category, id, value);
                }
            }
        });
    }
    async updateData() {
        if (!this.initialized) return;
        if (this.profiles.length === 0) return this.setActivity({});

        if (this.settings.disableWhenActivity) {
            const activities = this.getLocalPresence().activities;
            if (activities.filter(a => a?.application_id && a.application_id !== this.activeProfile.clientID).length) {
                if (activities.find(a => a?.application_id && a.application_id === this.activeProfile.clientID)) this.setActivity({});
                return;
            }
        }
        setTimeout(() => this.updateRichPresence(), 50);
    }
    setActivity(activity) {
        const obj = activity && (Object.entries(activity).length > 0 && Object.assign(activity, { flags: 1, type: this.activeProfile?.listeningTo ? 2 : 0 }) || activity);
        console.log(obj);
        this.rpc.dispatch({
            type: "LOCAL_ACTIVITY_UPDATE",
            activity: obj
        });
    }
    isNullOrEmpty(input) {
        return input === undefined || input === null || input === '';
    }
    async updateRichPresence() {
        if (!this.initialized || !this.activeProfile) return;

        let button_urls = [], buttons = [];
        if (!this.isNullOrEmpty(this.activeProfile.button1Label) && !this.isNullOrEmpty(this.activeProfile.button1URL)) {
            if (this.activeProfile.button1Label.length > 32) BdApi.showToast("[AutoStartRichPresence] Button 1 label must not exceed 32 characters.", { type: "error" });
            else if (!isURL(this.activeProfile.button1URL)) BdApi.showToast("[AutoStartRichPresence] Invalid button 1 URL.", { type: "error" });
            else {
                buttons.push(this.activeProfile.button1Label);
                button_urls.push(this.activeProfile.button1URL);
            }
        }
        if (!this.isNullOrEmpty(this.activeProfile.button2Label) && !this.isNullOrEmpty(this.activeProfile.button2URL)) {
            if (this.activeProfile.button2Label.length > 32) BdApi.showToast("[AutoStartRichPresence] Button 2 label must not exceed 32 characters.", { type: "error" });
            else if (!isURL(this.activeProfile.button2URL)) BdApi.showToast("[AutoStartRichPresence] Invalid button 2 URL.", { type: "error" });
            else {
                buttons.push(this.activeProfile.button2Label);
                button_urls.push(this.activeProfile.button2URL);
            }
        }
        if (this.activeProfile.enableStartTime) {
            if (this.startPlaying == null) this.startPlaying = Date.now();
        } else if (this.startPlaying) this.startPlaying = null;

        let obj = {
            application_id: this.activeProfile.clientID ?? "1012465934088405062",
            name: this.activeProfile.name || undefined,
            details: this.activeProfile.details || undefined,
            state: this.activeProfile.state || undefined,
            timestamps: this.startPlaying ? { start: Math.floor(this.startPlaying / 1000) } : undefined,
            assets: (!this.isNullOrEmpty(this.activeProfile.smallImageKey)) ? {
                small_image: await this.getAsset(this.activeProfile.smallImageKey),
                small_text: this.activeProfile.smallImageText ?? undefined,
            } : {},
            metadata: { button_urls }, buttons
        }
        if (!this.isNullOrEmpty(this.activeProfile.largeImageKey)) {
            obj.assets.large_image = await this.getAsset(this.activeProfile.largeImageKey);
            obj.assets.large_text = this.activeProfile.largeImageText ?? undefined;
        }
        this.setActivity(obj);
    }
    updateSettings() {
        this.api.Data.save("settings", this.settings);
        this.updateData(); // will return when not initialized
    }
    updateProfiles() {
        this.api.Data.save("profiles", this.profiles);
    }
    deleteProfile(id) {
        this.profiles.splice(id, 1);
        if (this.settings.activeProfileID === id) {
            this.settings.activeProfileID = 0;
            this.updateSettings();
            this.updateData();
        } else if (this.settings.activeProfileID > id) {
            this.settings.activeProfileID--;
            this.updateSettings();
        }
        this.updateProfiles();
    }
    migrateData() {
        let profilesData = this.api.Data.load("profiles");
        // if (!profilesData?.length || profilesData.length > 0) return;
        this.settings = this.api.Data.load("settings");
        BdApi.showToast("[AutoStartRichPresence] Migrating your data...");
        this.settings.activeProfileID = 0;
        this.settings.disableWhenActivity = false;
        profilesData = [{
            pname: "My Profile"
        }];
        for (const key of ["clientID", "name", "details", "state", "largeImageKey", "largeImageText", "smallImageKey", "smallImageText", "button1Label", "button1URL", "button2Label", "button2URL", "enableStartTime", "listeningTo"]) {
            profilesData[0][key] = this.settings[key];
            delete this.settings[key];
        }
        this.profiles = profilesData;
        this.updateProfiles();
        this.updateSettings();
        BdApi.showToast("[AutoStartRichPresence] Migrated your data", { type: "success" });
    }
}

module.exports = AutoStartRichPresence;

/*@end @*/
