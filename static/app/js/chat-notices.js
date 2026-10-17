(function () {
    'use strict';
    function escapeText(text) {
        return String(text).replace(/[&<>"']/g, function (character) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
        });
    }
    function install(options) {
        options.methods.addFriendSuccessNotice = function () {
            var selected = this.getSelectedUser();
            var friend = selected && !selected.is_me ? selected : this.getOtherUser();
            var name = String((friend && friend.name) || this.setting.title || '好友').trim() || '好友';
            this.addDialog({
                id: 'dialog-friend-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
                type: 'notice',
                notice_kind: 'friend-added',
                is_system: 1,
                content: '你已添加了' + escapeText(name) + '，现在可以开始聊天了。'
            });
        };
    }
    window.WechatNotices = { install: install };
}());
