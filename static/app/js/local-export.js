(function () {
    'use strict';
    var busy = false;
    var previewUrls = [];
    var storageKeys = ['phone', 'wechat_setting', 'wechat_users', 'wechat_dialogs', 'wechat_custom_stickers', 'wechat_saved_users'];

    function message(text) {
        var status = document.getElementById('local-export-status');
        if (status) status.textContent = text;
    }

    function backupChat() {
        try {
            var storage = {};
            storageKeys.forEach(function (key) {
                var value = localStorage.getItem(key);
                if (value !== null) storage[key] = JSON.parse(value);
            });
            var blob = new Blob([JSON.stringify({ format: 'wxdh-chat-backup', version: 1, storage: storage })], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var link = document.createElement('a');
            link.href = url;
            link.download = '微信聊天备份-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
            message('聊天备份已下载');
        } catch (error) {
            message('备份失败：' + error.message);
        }
    }

    async function restoreChat(file) {
        if (!file) return;
        try {
            if (file.size > 20 * 1024 * 1024) throw new Error('备份文件过大');
            var backup = JSON.parse(await file.text());
            if (backup.format !== 'wxdh-chat-backup' || backup.version !== 1 || !backup.storage || typeof backup.storage !== 'object') {
                throw new Error('请选择本项目下载的聊天备份 JSON 文件');
            }
            var saved = backup.storage;
            if ((saved.wechat_users && !Array.isArray(saved.wechat_users)) || (saved.wechat_dialogs && !Array.isArray(saved.wechat_dialogs)) || (saved.wechat_custom_stickers && !Array.isArray(saved.wechat_custom_stickers)) || (Object.prototype.hasOwnProperty.call(saved, 'wechat_saved_users') && !Array.isArray(saved.wechat_saved_users))) {
                throw new Error('备份中的聊天数据格式不正确');
            }
            var previous = {};
            storageKeys.forEach(function (key) { previous[key] = localStorage.getItem(key); });
            try {
                storageKeys.forEach(function (key) {
                    if (Object.prototype.hasOwnProperty.call(saved, key)) localStorage.setItem(key, JSON.stringify(saved[key]));
                    else if (key !== 'wechat_saved_users') localStorage.removeItem(key);
                });
            } catch (error) {
                storageKeys.forEach(function (key) {
                    if (previous[key] === null) localStorage.removeItem(key);
                    else localStorage.setItem(key, previous[key]);
                });
                throw error;
            }
            window.location.reload();
        } catch (error) {
            message('恢复失败：' + error.message);
        }
    }

    function waitForImages(element) {
        return Promise.all(Array.from(element.querySelectorAll('img')).map(function (img) {
            if (!img.getAttribute('src')) return Promise.resolve();
            if (/\/(face-default\.jpg|10014\.jpg|user-face\.png)(?:\?|$)/.test(img.src)) {
                img.src = window._path.defaultAvatar;
            }
            return new Promise(function (resolve) {
                var timeout = setTimeout(resolve, 5000);
                function done() { clearTimeout(timeout); resolve(); }
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
                if (img.complete) done();
            });
        }));
    }

    function showPreview(blobs, longMode, metadata) {
        var previous = document.getElementById('local-export-preview');
        if (previous) previous.remove();
        previewUrls.forEach(function (url) { URL.revokeObjectURL(url); });
        var urls = blobs.map(function (blob) { return URL.createObjectURL(blob); });
        previewUrls = urls;
        metadata = metadata || {};
        var filename = (longMode ? '微信长截图-' : '微信对话-') + new Date(metadata.createdAt || Date.now()).toISOString().replace(/[:.]/g, '-');
        var modal = document.createElement('dialog');
        modal.id = 'local-export-preview';
        modal.setAttribute('aria-label', '聊天图片预览');
        modal.style.cssText = 'padding:16px;max-width:95vw;max-height:94vh;overflow:auto;border:1px solid #ddd;border-radius:10px;z-index:2147483647;background:#fff;';
        var imageStyle = longMode ? 'display:block;width:375px;max-width:100%;height:auto;margin:auto' : 'display:block;max-width:100%;max-height:75vh;object-fit:contain;margin:auto';
        var previewTitle = metadata.fromHistory ? (longMode ? '历史长截图' : '历史图片') : (longMode ? '长截图已生成' : '图片已生成');
        modal.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:12px;position:sticky;top:0;background:#fff;z-index:1;padding:6px 0"><strong>' + previewTitle + '</strong><a class="btn btn-primary" data-export-download>' + (blobs.length > 1 ? '下载第 1 段' : '下载 PNG 图片') + '</a><button type="button" class="btn" data-export-close>关闭</button></div><div data-export-pages><img alt="生成的微信聊天图片" style="' + imageStyle + '"></div>';
        modal.querySelector('img').src = urls[0];
        var download = modal.querySelector('[data-export-download]');
        download.href = urls[0];
        download.download = filename + (blobs.length > 1 ? '-第1段' : '') + '.png';
        for (var index = 1; index < blobs.length; index++) {
            var page = document.createElement('section');
            page.innerHTML = '<p style="padding:12px 0;margin:0;border-top:1px solid #ddd"><a class="btn btn-primary">下载第 ' + (index + 1) + ' 段</a></p><img alt="长截图后续部分" style="' + imageStyle + '">';
            page.querySelector('a').href = urls[index];
            page.querySelector('a').download = filename + '-第' + (index + 1) + '段.png';
            page.querySelector('img').src = urls[index];
            modal.querySelector('[data-export-pages]').appendChild(page);
        }
        modal.querySelector('[data-export-close]').addEventListener('click', function () { modal.close(); });
        modal.addEventListener('close', function () {
            modal.remove();
            urls.forEach(function (url) { URL.revokeObjectURL(url); });
            if (previewUrls === urls) previewUrls = [];
        }, { once: true });
        document.body.appendChild(modal);
        modal.showModal();
    }

    function expandConversation(copy, originalHeight) {
        var body = copy.querySelector('.phone-body');
        if (!body) throw new Error('未找到聊天内容');
        var top = body.offsetTop;
        var viewportHeight = body.clientHeight;
        var bottom = Math.max(0, originalHeight - top - viewportHeight);
        body.scrollTop = 0;
        body.style.bottom = 'auto';
        body.style.height = 'auto';
        body.style.minHeight = '0';
        body.style.maxHeight = 'none';
        body.style.overflow = 'visible';
        var content = body.querySelector('.wechat-content');
        var contentHeight = Math.ceil(Math.max(viewportHeight, body.scrollHeight, body.offsetHeight, content ? content.scrollHeight : 0));
        body.style.height = contentHeight + 'px';
        var height = Math.ceil(Math.max(originalHeight, top + contentHeight + bottom));
        copy.style.height = height + 'px';
        return height;
    }

    function captureRegions(copy, height) {
        // Keep each canvas below browser limits without shrinking long messages
        // to illegible text. Prefer splitting immediately before a message.
        var maximumHeight = 60000;
        if (height <= maximumHeight) return [{ y: 0, height: height }];
        var top = copy.getBoundingClientRect().top;
        var boundaries = Array.from(copy.querySelectorAll('.wechat-content > .wechat-dialog')).map(function (dialog) {
            return Math.floor(dialog.getBoundingClientRect().top - top);
        }).filter(function (value) { return value > 0 && value < height; }).sort(function (a, b) { return a - b; });
        var regions = [];
        var start = 0;
        while (start < height) {
            var end = Math.min(start + maximumHeight, height);
            if (end < height) {
                var candidate = boundaries.filter(function (value) { return value > start + maximumHeight / 2 && value <= end; }).pop();
                if (candidate) end = candidate;
            }
            regions.push({ y: start, height: end - start });
            start = end;
        }
        return regions;
    }

    function trimHomeIndicator(copy, height, longMode) {
        var bar = copy.querySelector('.phone-bottom-bar');
        if (!bar) return height;
        var removedHeight = bar.offsetHeight;
        bar.remove();
        var footer = copy.querySelector('.phone-bottom');
        var body = copy.querySelector('.phone-body');
        // Shorten the phone and its bottom inset equally so visible messages
        // keep their size and scroll position when the home indicator is removed.
        if (!longMode && body && footer) body.style.bottom = footer.offsetHeight + 'px';
        var croppedHeight = Math.max(1, height - removedHeight);
        copy.style.height = croppedHeight + 'px';
        return croppedHeight;
    }

    async function generate(button, longMode) {
        if (busy) return;
        var buttonLabel = button.textContent;
        busy = true;
        button.disabled = true;
        button.textContent = '正在生成…';
        message(longMode ? '正在展开完整对话…' : '正在准备聊天图片…');
        var copy = null;
        var watchdog;
        try {
            if (typeof window.wxdhRender !== 'function') {
                throw new Error('图片生成组件未加载，请按 Ctrl + F5 刷新页面');
            }
            var phone = document.getElementById('phone');
            if (!phone) throw new Error('未找到聊天预览');
            copy = phone.cloneNode(true);
            copy.removeAttribute('id');
            copy.classList.add('iPhoneX');
            copy.style.position = 'absolute';
            copy.style.left = '-100000px';
            copy.style.top = '0';
            copy.style.transform = 'none';
            var width = phone.offsetWidth;
            var height = phone.offsetHeight;
            if (!width || !height) throw new Error('聊天预览尺寸不正确，请刷新页面');
            copy.style.width = width + 'px';
            copy.style.height = height + 'px';
            document.body.appendChild(copy);
            Array.from(copy.querySelectorAll('.a-wechat-dialog-del, .a-wechat-dialog-menu')).forEach(function (control) { control.remove(); });
            var originalBody = phone.querySelector('.phone-body');
            var copiedBody = copy.querySelector('.phone-body');
            if (originalBody && copiedBody) copiedBody.scrollTop = originalBody.scrollTop;
            await waitForImages(copy);
            if (longMode) height = expandConversation(copy, height);
            height = trimHomeIndicator(copy, height, longMode);
            var regions = longMode ? captureRegions(copy, height) : [{ y: 0, height: height }];
            var blobs = [];
            var thumbnail = null;
            for (var index = 0; index < regions.length; index++) {
                var region = regions[index];
                var scale = Math.min(1, 30000 / region.height, Math.sqrt(24000000 / (width * region.height)));
                message(regions.length > 1 ? '对话较长，正在生成第 ' + (index + 1) + ' / ' + regions.length + ' 段…' : (longMode ? '正在生成完整长截图…' : '正在生成 PNG 图片，请稍候…'));
                var canvas = await Promise.race([
                    window.wxdhRender(copy, {
                        scale: scale,
                        width: width,
                        height: region.height,
                        y: region.y,
                        scrollX: 0,
                        scrollY: 0,
                        backgroundColor: '#ededed',
                        allowTaint: false,
                        useCORS: true,
                        imageTimeout: 5000,
                        logging: false
                    }),
                    new Promise(function (_, reject) {
                        watchdog = setTimeout(function () { reject(new Error('图片生成超时，请刷新页面后再试')); }, longMode ? 60000 : 30000);
                    })
                ]);
                clearTimeout(watchdog);
                var blob = await new Promise(function (resolve, reject) {
                    canvas.toBlob(function (result) {
                        if (result) resolve(result);
                        else reject(new Error('无法保存图片，请使用 Chrome 或 Edge 浏览器'));
                    }, 'image/png');
                });
                blobs.push(blob);
                if (index === 0 && window.WechatImageHistory) thumbnail = await window.WechatImageHistory.createThumbnail(canvas);
                canvas.width = 1;
                canvas.height = 1;
            }
            var createdAt = Date.now();
            showPreview(blobs, longMode, { createdAt: createdAt });
            var resultMessage = regions.length > 1 ? '长截图已分为 ' + regions.length + ' 段，请在预览窗口分别下载。' : (longMode ? '长截图已生成，包含从头到尾的完整对话。' : '图片已生成，请在预览窗口点击“下载 PNG 图片”');
            message(resultMessage + ' 正在保存图片历史…');
            if (window.WechatImageHistory) {
                try {
                    var titleNode = phone.querySelector('.phone-nav-center font');
                    await window.WechatImageHistory.save({
                        title: titleNode && titleNode.textContent ? titleNode.textContent.trim() : '微信对话',
                        createdAt: createdAt, longMode: longMode, parts: blobs, thumbnail: thumbnail
                    });
                    message(resultMessage + ' 已保存到图片历史。');
                } catch (error) {
                    message(resultMessage + ' 历史保存失败：' + error.message + '，请先下载图片。');
                }
            } else message(resultMessage);
        } catch (error) {
            console.error('生成图片失败', error);
            message('生成失败：' + (error.message || String(error)));
        } finally {
            clearTimeout(watchdog);
            if (copy) copy.remove();
            busy = false;
            button.disabled = false;
            button.textContent = buttonLabel;
        }
    }

    // Delegate from the document so Vue replacing the button during mount is safe.
    document.addEventListener('click', function (event) {
        var button = event.target.closest('#local-export-button');
        if (button) { event.preventDefault(); generate(button, false); }
        var longButton = event.target.closest('#local-export-long-button');
        if (longButton) { event.preventDefault(); generate(longButton, true); }
        if (event.target.closest('#local-backup-button')) { event.preventDefault(); backupChat(); }
        if (event.target.closest('#local-restore-button')) {
            event.preventDefault();
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json,.json';
            input.style.setProperty('display', 'none', 'important');
            input.addEventListener('change', function () {
                restoreChat(input.files[0]);
                input.remove();
            }, { once: true });
            input.addEventListener('cancel', function () { input.remove(); }, { once: true });
            document.body.appendChild(input);
            input.click();
        }
    });
    window.WechatImageExport = { showPreview: showPreview };
}());
