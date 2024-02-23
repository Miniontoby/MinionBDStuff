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

function isURL(url) {
    try {
        const newUrl = new URL(url);
        return newUrl.protocol === 'http:' || newUrl.protocol === 'https:';
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
            if (getAsset && this.activeProfile.clientID) return (await getAsset(this.activeProfile.clientID, [key, undefined]))[0];
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
        if (this.settings.clientID || this.settings.details || this.settings.state) this.migrateData();

        this.profiles = BdApi.loadData("AutoStartRichPresence", "profiles") || [];
        if (!this.settings.activeProfileID && this.profiles.length) this.settings.activeProfileID = 0;

        this.session = {
            editingProfile: this.settings.activeProfileID || 0,
        };

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
        this.settings = BdApi.loadData("AutoStartRichPresence", "settings") || {};
        this.profiles = BdApi.loadData("AutoStartRichPresence", "profiles") || [];
        const panel = document.createElement("form");
        panel.classList.add("form");
        panel.style.setProperty("width", "100%");
        panel.appendChild(this.generateSettings());
        return panel;
    }
    async updateData() {
        if (!this.initialized) return;
        if (this.profiles.length === 0) return this.setActivity({});

        if (this.settings.disableWhenActivity) {
            const activities = this.getLocalPresence().activities;
            if (activities.filter(a => a.application_id !== this.settings.ClientID).length) {
                if (activities.find(a => a.application_id === this.settings.ClientID)) this.setActivity({});
                return;
            }
        }
        setTimeout(() => this.updateRichPresence(), 50);
    }
    createElement = tag => properties => Object.assign(document.createElement(tag), properties)
    createBr = this.createElement('br')
    createMyInput(label, description, type, id, options = undefined) {
        const wrap = this.createElement('div')();
        if (label !== '') {
            wrap.appendChild(this.createElement('b')({ textContent: label }));
            wrap.appendChild(this.createBr());
            if (description !== '') {
                wrap.appendChild(this.createElement('span')({ textContent: description }));
                wrap.appendChild(this.createBr());
            }
        }
        wrap.appendChild(this.createBr());
        const thisinput = this.createElement(type == 'onoff' ? 'select' : type)({ id, className: 'inputDefault-Ciwd-S input-3O04eu width100__1676d', style: 'color:inherit' });
        if (type == 'input') thisinput.setAttribute('type', 'text');
        else if (type == 'onoff') {
            thisinput.appendChild(this.createElement('option')({ value: 'false', textContent: 'OFF' }));
            thisinput.appendChild(this.createElement('option')({ value: 'true', textContent: 'ON' }));
        }
        else if (type == 'select' && options) {
            for (const opt of options) thisinput.appendChild(this.createElement('option')({ value: opt.value, textContent: opt.label, selected: opt?.selected }));
        }
        wrap.appendChild(thisinput);
        wrap.appendChild(this.createBr());wrap.appendChild(this.createBr());
        return wrap;
    }
    generateSettings() {
        const element = this.createElement("div")({ style: 'color:var(--header-primary);font-size:16px;font-weight:300;line-height:22px;max-width:550px;margin-top:17px' });
        element.appendChild(this.createMyInput('Select Active Profile', 'With this plugin you can have multiple presets.', 'select', 'ASRPActiveProfileSelector', this.profiles.map((prof, i) => { return { value: String(i), label: prof.pname, selected: i == this.settings.activeProfileID }; })));
        element.appendChild(this.createMyInput('Disable When Activity', 'Disables when there is another activity', 'onoff', 'disableWhenActivity'));
	element.appendChild(this.createBr());
	element.appendChild(this.createElement('hr')());
	element.appendChild(this.createMyInput('Select Editing Profile', 'In order to change the name of the profile, edit profiles -> pname of AutoStartRichPresence.config.json.', 'select', 'ASRPProfileSelector', this.profiles.map((prof, i) => { return { value: String(i), label: prof.pname }; })));
        element.appendChild(this.createElement('button')({ id: 'createProfile', textContent: 'Create New Profile', className: 'bd-button button_afdfd9 lookFilled__19298 colorBrand_b2253e sizeMedium_c6fa98 grow__4c8a4' }))
	element.appendChild(this.createBr());
	element.appendChild(this.createBr());
	element.appendChild(this.createElement('hr')());

        const editContainer = this.getSettingsFields();
        element.appendChild(editContainer);
        if (this.profiles?.length && this.profiles?.length > 0 && this.session.editingProfile <= this.profiles.length)
            this.reloadEditProfileInputFields(editContainer, this.session.editingProfile);

        element.appendChild(this.createElement('button')({ id: 'deleteProfile', textContent: 'Delete Profile', className: 'bd-button button_afdfd9 lookFilled__19298 colorRed_d6b062 sizeMedium_c6fa98 grow__4c8a4' }))

        element.querySelector('select#ASRPActiveProfileSelector').onchange = function(e) {
            const id = e.target.value && Number(e.target.value);
            if (!isNaN(id)) {
                this.settings.activeProfileID = id;
                this.updateSettings();
            }
        }.bind(this);

        element.querySelector('select#ASRPProfileSelector').onchange = function(e) {
            const id = e.target.value && Number(e.target.value);
            if (!isNaN(id)) {
                this.session.editingProfile = id;
                console.log('Edit profile changed')
                this.reloadEditProfileInputFields(editContainer);
            }
        }.bind(this);

        element.querySelector('button#createProfile').onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            this.profiles.push({
                pname: "New Profile",
            });
            if (this.profiles.length === 1) this.settings.activeProfileID = 0;
            this.session.editingProfile = this.profiles.length - 1;
            this.updateProfiles();
            this.reloadEditProfileGroup(element);
            this.reloadEditProfileInputFields(editContainer);
            BdApi.showToast("[AutoStartRichPresence] Created a new profile", { type: "success" });
        }.bind(this);

        element.querySelector('button#deleteProfile').onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            const profileIDToDelete = this.session.editingProfile;
            if (!this.profiles[profileIDToDelete]) return;
            BdApi.showConfirmationModal("Delete Rich Presence Profile", `Are you sure you want to delete ${this.profiles[profileIDToDelete]?.name || "this profile"}? (This will not delete any Discord Developer Applications.)`, {
                danger: true,
                confirmText: "Delete",
                onConfirm: () => {
                    this.deleteProfile(profileIDToDelete);
                    this.updateProfiles();
                    this.reloadEditProfileGroup(element);
                    this.reloadEditProfileInputFields(editContainer);
                    BdApi.showToast("[AutoStartRichPresence] Deleted profile", { type: "success" });
                }
            });
        }.bind(this);

        (() => {
            const el = element.querySelector('select#disableWhenActivity');
            el.value = this.settings?.disableWhenActivity ? "true" : "false";
            el.onchange = function(e) {
                const value = e.target.value == 'true';
                this.settings.disableWhenActivity = value;
                this.updateSettings();
            }.bind(this);
        })()

        return element;
    }
    getSettingsFields() {
        const main = this.createElement('div')({ className: 'ASRPprofile' });
        main.appendChild(this.createMyInput('Client ID', 'Enter your Client ID (get from developers page) [needed for image keys]', 'input', 'clientID'));        main.appendChild(this.createMyInput('Activity Name', 'Enter a name for the activity', 'input', 'name'));
        main.appendChild(this.createMyInput('Activity Details', 'Enter a description for the activity', 'input', 'details'));
        main.appendChild(this.createMyInput('Activity State', 'Enter a second description for the activity', 'input', 'state'));
        main.appendChild(this.createMyInput('Activity Button 1 Text', 'Enter Text for button 1', 'input', 'button1Label'));
        main.appendChild(this.createMyInput('Activity Button 1 URL', 'Enter URL for button 1', 'input', 'button1URL'));
        main.appendChild(this.createMyInput('Activity Button 2 Text', 'Enter Text for button 2', 'input', 'button2Label'));
        main.appendChild(this.createMyInput('Activity Button 2 URL', 'Enter URL for button 2', 'input', 'button2URL'));
        main.appendChild(this.createMyInput('Activity Small Image Key', 'Enter Image Key for Small Icon', 'input', 'smallImageKey'));
        main.appendChild(this.createMyInput('Activity Small Image Text', 'Enter Label for Small Icon', 'input', 'smallImageText'));
        main.appendChild(this.createMyInput('Activity Large Image Key', 'Enter Image Key for Large Icon', 'input', 'largeImageKey'));
        main.appendChild(this.createMyInput('Activity Large Image Text', 'Enter Label for Large Icon', 'input', 'largeImageText'));
        main.appendChild(this.createMyInput('Enable Start Time', 'Enable timestamp which shows the time when started', 'onoff', 'enableStartTime'));
        main.appendChild(this.createMyInput('Listening Status', 'Enable listening status', 'onoff', 'listeningTo'));
        return main;
    }
    reloadEditProfileGroup(element) {
        const activeOptions = this.profiles.map((prof, i) => { return { value: String(i), label: prof.pname, selected: i == this.settings.activeProfileID }; })
        const activeEl = element.querySelector('select#ASRPActiveProfileSelector');
        [...activeEl.querySelectorAll('option')].map((el, i) => el.remove());
        for (const opt of activeOptions) {
            const newEl = this.createElement('option')({ value: opt.value, textContent: opt.label });
            if (opt?.selected) newEl.setAttribute('selected', '');
            activeEl.appendChild(newEl);
        }

        const editOptions = this.profiles.map((prof, i) => { return { value: String(i), label: prof.pname, selected: i == this.session.editingProfile }; })
        const editEl = element.querySelector('select#ASRPProfileSelector');
        [...editEl.querySelectorAll('option')].map((el, i) => el.remove());
        for (const opt of editOptions) {
            const newEl = this.createElement('option')({ value: opt.value, textContent: opt.label });
            if (opt?.selected) newEl.setAttribute('selected', '');
            editEl.appendChild(newEl);
        }
    }
    reloadEditProfileInputFields(editContainer) {
        let updateSetting = (setting, newv) => {
            if (this.profiles[this.session.editingProfile][setting] !== newv) {
                this.profiles[this.session.editingProfile][setting] = newv;
                this.updateProfiles();
            }
        }
        const TextInputs = ["clientID", "name", "details", "state", "button1Label", "button1URL", "button2Label", "button2URL", "smallImageKey", "smallImageText", "largeImageKey", "largeImageText"];
        for (const setting of TextInputs) {
            const el = editContainer.querySelector('#' + setting);

            if (!this.profiles[this.session.editingProfile]) {
                el.setAttribute('disabled', '');
                continue;
            }
            else el.removeAttribute('disabled');

            el.value = this.profiles[this.session.editingProfile][setting] ?? "";
            el.onchange = (e) => updateSetting(setting, e.target.value);
            el.onpaste = (e) => updateSetting(setting, e.target.value);
            el.onkeydown = (e) => updateSetting(setting, e.target.value);
        }
        const OnOffInputs = ["enableStartTime", "listeningTo"];
        for (const setting of OnOffInputs) {
            const el = editContainer.querySelector('#' + setting);

            if (!this.profiles[this.session.editingProfile]) {
                el.setAttribute('disabled', '');
                continue;
            }
            else el.removeAttribute('disabled');

            el.value = this.profiles[this.session.editingProfile][setting] ? "true" : "false";
            el.onchange = (e) => updateSetting(setting, e.target.value === 'true');
        }
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
            timestamps: { start: this.startPlaying ? Math.floor(this.startPlaying / 1000) : undefined },
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
        BdApi.saveData("AutoStartRichPresence", "settings", this.settings);
        this.updateData(); // will return when not initialized
    }
    updateProfiles() {
        BdApi.saveData("AutoStartRichPresence", "profiles", this.profiles);
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
        if (this.session.editingProfile === id) {
            this.session.editingProfile = this.settings.activeProfileID;
        }
        this.updateProfiles();
    }
    migrateData() {
        let profilesData = BdApi.loadData("AutoStartRichPresence", "profiles");
        // if (!profilesData?.length || profilesData.length > 0) return;
        this.settings = BdApi.loadData("AutoStartRichPresence", "settings");
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
