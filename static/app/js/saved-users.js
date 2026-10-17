(function () {
    'use strict';
    var storageKey = 'wechat_saved_users';
    function validAvatar(image) {
        return typeof image === 'string' && /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(image);
    }
    function firstSavedTime(item) {
        // The saved ID retains its creation time even when the profile is updated.
        var match = /^saved-user-(\d+)-/.exec(item.id);
        return match ? Number(match[1]) : 0;
    }
    function readUsers() {
        var items;
        try { items = JSON.parse(localStorage.getItem(storageKey) || '[]'); }
        catch (_) { throw new Error('无法读取常用用户，请检查浏览器是否允许本地存储'); }
        if (!Array.isArray(items)) throw new Error('常用用户数据格式不正确');
        return items.filter(function (item) {
            return item && typeof item.id === 'string' && item.id.indexOf('saved-user-') === 0 &&
                typeof item.name === 'string' && item.name.trim() && validAvatar(item.image);
        }).map(function (item) { return { id: item.id, name: item.name, image: item.image }; })
            .sort(function (first, second) { return firstSavedTime(first) - firstSavedTime(second); });
    }
    function writeUsers(items) {
        try { localStorage.setItem(storageKey, JSON.stringify(items)); }
        catch (_) { throw new Error('保存失败，本地存储空间不足或被禁用，请先备份再整理收藏'); }
    }
    function uniqueId(prefix) {
        return prefix + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    }
    function install(options) {
        var items = [], status = '';
        try { items = readUsers(); } catch (error) { status = error.message; }
        Object.assign(options.data, { savedUsers: items, savedUserStatus: status });
        Object.assign(options.methods, {
            saveFrequentUser: function (index) {
                var user = this.users[index];
                if (!user) return;
                var name = String(user.name || '').trim();
                if (!name) { this.savedUserStatus = '请先填写用户名'; return; }
                var image = user.image;
                if (!validAvatar(image)) {
                    this.savedUserStatus = '请先上传本地头像，再保存用户'; return;
                }
                try {
                    var saved = readUsers();
                    var existing = saved.findIndex(function (item) { return item.id === user.saved_profile_id; });
                    if (existing < 0) existing = saved.findIndex(function (item) { return item.name === name && item.image === image; });
                    var profile = { id: existing >= 0 ? saved[existing].id : uniqueId('saved-user-'), name: name, image: image };
                    if (existing >= 0) saved.splice(existing, 1, profile);
                    else saved.push(profile);
                    writeUsers(saved);
                    this.$set(user, 'saved_profile_id', profile.id);
                    this.savedUsers = saved;
                    this.savedUserStatus = (existing >= 0 ? '已更新：' : '已保存：') + name;
                } catch (error) { this.savedUserStatus = error.message; }
            },
            useFrequentUser: function (id, asMe) {
                var profile = this.savedUsers.find(function (item) { return item.id === id; });
                if (!profile) return;
                var index = this.users.findIndex(function (user) {
                    return asMe ? !!user.is_me : !user.is_me &&
                        (user.saved_profile_id === id || (user.name === profile.name && user.image === profile.image));
                });
                if (index < 0) {
                    var user = { id: uniqueId('user-'), name: profile.name, image: profile.image,
                        is_me: !!asMe, selected: false, saved_profile_id: id };
                    if (asMe) { this.users.unshift(user); index = 0; }
                    else { this.users.push(user); index = this.users.length - 1; }
                } else {
                    // Keep the conversation user ID so existing messages retain their sender.
                    this.$set(this.users[index], 'name', profile.name);
                    this.$set(this.users[index], 'image', profile.image);
                    this.$set(this.users[index], 'saved_profile_id', id);
                }
                this.users.forEach(function (user, position) { this.$set(user, 'selected', position === index); }, this);
                this.savedUserStatus = '已选择' + (asMe ? '自己：' : '对方：') + profile.name;
            },
            removeFrequentUser: function (id) {
                var profile = this.savedUsers.find(function (item) { return item.id === id; });
                if (!profile || !window.confirm('从常用用户中移除“' + profile.name + '”？当前对话中的用户和消息会保留。')) return;
                try {
                    var saved = readUsers().filter(function (item) { return item.id !== id; });
                    writeUsers(saved);
                    this.savedUsers = saved;
                    this.savedUserStatus = '已移除：' + profile.name;
                } catch (error) { this.savedUserStatus = error.message; }
            }
        });
    }
    window.WechatSavedUsers = { install: install };
}());
