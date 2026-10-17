(function () {
    'use strict';
    var storageKey = 'wechat_custom_stickers';
    var builtin = window.WechatStickerAssets || [];
    function readCustom() {
        var saved;
        try { saved = JSON.parse(localStorage.getItem(storageKey) || '[]'); }
        catch (_) { saved = []; }
        if (!Array.isArray(saved)) return [];
        return saved.filter(function (item) {
            return item && typeof item.id === 'string' && item.id.indexOf('custom-') === 0 &&
                typeof item.name === 'string' && /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(item.image);
        }).map(function (item) {
            return { id: item.id, name: item.name.slice(0, 40), category: '我的', image: item.image, width: Number(item.width) > 0 ? Number(item.width) : 384, height: Number(item.height) > 0 ? Number(item.height) : 384 };
        });
    }
    function writeCustom(items) {
        try { localStorage.setItem(storageKey, JSON.stringify(items)); }
        catch (_) { throw new Error('本地存储空间不足，请先备份聊天或删除不常用的自定义表情'); }
    }
    function imageFromFile(file) {
        return new Promise(function (resolve, reject) {
            if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
                reject(new Error('请选择 PNG、JPG、GIF 或 WebP 图片')); return;
            }
            if (file.size > 8 * 1024 * 1024) { reject(new Error('单张表情请小于 8 MB')); return; }
            var reader = new FileReader();
            reader.onerror = function () { reject(new Error('无法读取图片')); };
            reader.onload = function () {
                var image = new Image();
                image.onerror = function () { reject(new Error('图片格式无法识别')); };
                image.onload = function () {
                    try {
                        var ratio = Math.min(1, 384 / Math.max(image.naturalWidth, image.naturalHeight));
                        var canvas = document.createElement('canvas');
                        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
                        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
                        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
                        resolve({
                            id: 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
                            name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || '我的表情',
                            category: '我的',
                            width: canvas.width,
                            height: canvas.height,
                            image: canvas.toDataURL('image/png')
                        });
                    } catch (_) { reject(new Error('无法处理这张图片，请换一张 PNG 或 JPG')); }
                };
                image.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    }
    function install(options) {
        Object.assign(options.data, {
            stickerItems: builtin.concat(readCustom()), stickerCategory: '全部', stickerStatus: '', stickerPanelExpanded: true
        });
        Object.assign(options.methods, {
            selectStickerCategory: function (category) {
                if (category === '全部' && this.stickerCategory === '全部') {
                    this.stickerPanelExpanded = !this.stickerPanelExpanded;
                } else {
                    this.stickerCategory = category;
                    this.stickerPanelExpanded = true;
                }
            },
            visibleStickers: function () {
                var category = this.stickerCategory;
                return this.stickerItems.filter(function (item) { return category === '全部' || item.category === category; });
            },
            stickerStyle: function (dialog) {
                var width = dialog.sticker_width || 384;
                var height = dialog.sticker_height || 384;
                var scale = 420 / Math.max(width, height);
                return { width: Math.round(width * scale) + 'px', height: Math.round(height * scale) + 'px' };
            },
            sendSticker: function (id) {
                var sender = this.getSelectedUser();
                if (!sender) { this.stickerStatus = '请先在上方选择发送人'; return; }
                var sticker = this.stickerItems.find(function (item) { return item.id === id; });
                if (!sticker) return;
                this.addDialog({
                    id: 'dialog-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
                    type: 'sticker', image: sticker.image, sticker_name: sticker.name,
                    sticker_width: sticker.width || 384, sticker_height: sticker.height || 384,
                    is_me: sender.is_me, user_id: sender.id
                });
                this.stickerStatus = '已发送：' + sticker.name;
            },
            uploadCustomStickers: function () {
                var app = this;
                var input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/png,image/jpeg,image/gif,image/webp';
                input.multiple = true;
                input.style.setProperty('display', 'none', 'important');
                input.addEventListener('cancel', function () { input.remove(); }, { once: true });
                input.addEventListener('change', async function () {
                    var files = Array.from(input.files || []);
                    input.remove();
                    if (!files.length) return;
                    var added = 0;
                    try {
                        app.stickerStatus = '正在保存表情…';
                        for (var index = 0; index < files.length; index++) {
                            var sticker = await imageFromFile(files[index]);
                            var custom = readCustom();
                            custom.push(sticker);
                            writeCustom(custom);
                            app.stickerItems = builtin.concat(custom);
                            app.stickerCategory = '我的';
                            app.stickerPanelExpanded = true;
                            added++;
                        }
                        app.stickerStatus = '已保存 ' + added + ' 张表情，点击图片即可发送';
                    } catch (error) {
                        app.stickerStatus = (added ? '已保存 ' + added + ' 张。' : '') + error.message;
                    }
                }, { once: true });
                document.body.appendChild(input);
                input.click();
            },
            removeCustomSticker: function (id) {
                var custom = readCustom().filter(function (item) { return item.id !== id; });
                try {
                    writeCustom(custom);
                    this.stickerItems = builtin.concat(custom);
                    this.stickerStatus = '已移除收藏，已发送的表情消息仍然保留';
                } catch (error) { this.stickerStatus = error.message; }
            }
        });
    }
    window.WechatStickers = { install: install };
}());
