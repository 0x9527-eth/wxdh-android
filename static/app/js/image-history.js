(function () {
    'use strict';
    var databasePromise;
    var activeDialog;

    function openDatabase() {
        if (databasePromise) return databasePromise;
        if (!window.indexedDB) return Promise.reject(new Error('当前浏览器不支持保存图片历史'));
        databasePromise = new Promise(function (resolve, reject) {
            var request;
            var failed = false;
            try { request = window.indexedDB.open('wxdh-image-history', 1); }
            catch (error) { reject(error); return; }
            request.onupgradeneeded = function () {
                var database = request.result;
                if (!database.objectStoreNames.contains('records')) {
                    database.createObjectStore('records', { keyPath: 'id' });
                }
                if (!database.objectStoreNames.contains('images')) {
                    database.createObjectStore('images', { keyPath: 'id' });
                }
            };
            request.onsuccess = function () {
                var database = request.result;
                if (failed) { database.close(); return; }
                database.onversionchange = function () { database.close(); databasePromise = null; };
                resolve(database);
            };
            request.onerror = function () { failed = true; reject(request.error || new Error('无法打开图片历史')); };
            request.onblocked = function () { failed = true; reject(new Error('图片历史正被其他页面占用，请关闭其他项目页面后重试')); };
        }).catch(function (error) { databasePromise = null; throw error; });
        return databasePromise;
    }

    async function save(input) {
        if (!input.parts.length) throw new Error('没有可以保存的图片');
        var database = await openDatabase();
        var createdAt = input.createdAt || Date.now();
        var id = 'image-' + createdAt + '-' + Math.random().toString(36).slice(2, 10);
        var record = {
            id: id, createdAt: createdAt, title: String(input.title || '微信对话').slice(0, 100),
            longMode: Boolean(input.longMode), partCount: input.parts.length,
            bytes: input.parts.reduce(function (sum, blob) { return sum + blob.size; }, 0),
            thumbnail: input.thumbnail || null
        };
        await new Promise(function (resolve, reject) {
            var transaction = database.transaction(['records', 'images'], 'readwrite');
            transaction.oncomplete = resolve;
            transaction.onabort = function () { reject(transaction.error || new Error('图片历史保存失败，可能是浏览器存储空间不足')); };
            transaction.objectStore('records').put(record);
            transaction.objectStore('images').put({ id: id, parts: input.parts });
        });
        return record;
    }

    async function list() {
        var database = await openDatabase();
        return new Promise(function (resolve, reject) {
            var transaction = database.transaction('records', 'readonly');
            var request = transaction.objectStore('records').getAll();
            transaction.oncomplete = function () {
                resolve(request.result.sort(function (a, b) { return b.createdAt - a.createdAt; }));
            };
            transaction.onabort = function () { reject(transaction.error || new Error('无法读取图片历史')); };
        });
    }

    async function get(id) {
        var database = await openDatabase();
        return new Promise(function (resolve, reject) {
            var transaction = database.transaction(['records', 'images'], 'readonly');
            var metadata = transaction.objectStore('records').get(id);
            var images = transaction.objectStore('images').get(id);
            transaction.oncomplete = function () {
                if (!metadata.result || !images.result) { reject(new Error('这条图片历史已不存在')); return; }
                resolve(Object.assign({}, metadata.result, { parts: images.result.parts }));
            };
            transaction.onabort = function () { reject(transaction.error || new Error('无法读取图片')); };
        });
    }

    async function remove(id) {
        var database = await openDatabase();
        return new Promise(function (resolve, reject) {
            var transaction = database.transaction(['records', 'images'], 'readwrite');
            transaction.oncomplete = resolve;
            transaction.onabort = function () { reject(transaction.error || new Error('删除历史失败')); };
            transaction.objectStore('records').delete(id);
            transaction.objectStore('images').delete(id);
        });
    }

    function createThumbnail(source) {
        return new Promise(function (resolve) {
            try {
                var scale = Math.min(1, 160 / source.width);
                var thumbnail = document.createElement('canvas');
                thumbnail.width = Math.max(1, Math.round(source.width * scale));
                thumbnail.height = Math.max(1, Math.min(240, Math.round(source.height * scale)));
                thumbnail.getContext('2d').drawImage(source, 0, 0, source.width, thumbnail.height / scale, 0, 0, thumbnail.width, thumbnail.height);
                thumbnail.toBlob(resolve, 'image/png');
            } catch (_) { resolve(null); }
        });
    }

    function formatTime(timestamp) {
        return new Date(timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    }

    function show() {
        if (activeDialog && activeDialog.isConnected) { activeDialog.focus(); return; }
        var modal = document.createElement('dialog');
        activeDialog = modal;
        modal.className = 'wxdh-image-history';
        modal.setAttribute('aria-label', '图片生成历史');
        modal.innerHTML = '<div class="wxdh-history-header"><strong>图片历史</strong><button type="button" class="btn" data-history-close>关闭</button></div><p class="wxdh-history-status" role="status" aria-live="polite">正在读取历史…</p><div class="wxdh-history-grid"></div>';
        var grid = modal.querySelector('.wxdh-history-grid');
        var status = modal.querySelector('.wxdh-history-status');
        var urls = [];
        var closed = false;
        var refreshVersion = 0;
        function releaseUrls() {
            urls.forEach(function (url) { URL.revokeObjectURL(url); });
            urls = [];
        }
        async function refresh() {
            var version = ++refreshVersion;
            try {
                var records = await list();
                if (closed || version !== refreshVersion) return;
                releaseUrls();
                grid.textContent = '';
                status.textContent = records.length ? '共 ' + records.length + ' 条，点击图片可重新打开和下载。' : '还没有图片历史。以后生成图片或长截图后，会自动保存在这里。';
                records.forEach(function (record) {
                    var card = document.createElement('article');
                    card.className = 'wxdh-history-card';
                    var open = document.createElement('button');
                    open.type = 'button';
                    open.className = 'wxdh-history-open';
                    open.title = '打开：' + record.title;
                    var thumbnail = document.createElement(record.thumbnail ? 'img' : 'div');
                    thumbnail.className = 'wxdh-history-thumbnail';
                    if (record.thumbnail) {
                        var url = URL.createObjectURL(record.thumbnail);
                        urls.push(url);
                        thumbnail.src = url;
                        thumbnail.alt = record.title;
                    } else thumbnail.textContent = record.longMode ? '长截图' : '图片';
                    open.appendChild(thumbnail);
                    var title = document.createElement('strong');
                    title.textContent = record.title;
                    open.appendChild(title);
                    var time = document.createElement('span');
                    time.textContent = formatTime(record.createdAt);
                    open.appendChild(time);
                    var kind = document.createElement('span');
                    kind.textContent = (record.longMode ? '长截图' : '普通截图') + (record.partCount > 1 ? ' · ' + record.partCount + ' 段' : '');
                    open.appendChild(kind);
                    open.addEventListener('click', async function () {
                        open.disabled = true;
                        try {
                            var saved = await get(record.id);
                            if (closed) return;
                            window.WechatImageExport.showPreview(saved.parts, saved.longMode, { createdAt: saved.createdAt, fromHistory: true });
                        } catch (error) { if (!closed) status.textContent = '打开失败：' + error.message; }
                        finally { open.disabled = false; }
                    });
                    card.appendChild(open);
                    var deletion = document.createElement('button');
                    deletion.type = 'button';
                    deletion.className = 'btn btn-sm wxdh-history-delete';
                    deletion.textContent = '删除这条历史';
                    deletion.addEventListener('click', async function () {
                        if (!window.confirm('删除这条图片历史？已下载的图片和聊天内容会保留。')) return;
                        deletion.disabled = true;
                        try { await remove(record.id); await refresh(); }
                        catch (error) { if (!closed) status.textContent = '删除失败：' + error.message; }
                        finally { deletion.disabled = false; }
                    });
                    card.appendChild(deletion);
                    grid.appendChild(card);
                });
            } catch (error) { if (!closed && version === refreshVersion) status.textContent = '读取失败：' + error.message; }
        }
        modal.querySelector('[data-history-close]').addEventListener('click', function () { modal.close(); });
        modal.addEventListener('close', function () {
            closed = true;
            releaseUrls();
            modal.remove();
            if (activeDialog === modal) activeDialog = null;
        }, { once: true });
        document.body.appendChild(modal);
        modal.showModal();
        refresh();
    }

    document.addEventListener('click', function (event) {
        if (event.target.closest('#local-image-history-button')) { event.preventDefault(); show(); }
    });
    window.WechatImageHistory = { save: save, list: list, get: get, remove: remove, createThumbnail: createThumbnail, show: show };
}());
