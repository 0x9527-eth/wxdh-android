(function () {
    'use strict';
    // Keep the textarea selection when choosing an emoji with the mouse.
    document.addEventListener('mousedown', function (event) {
        if (event.target.closest('[data-chat-emoji]')) event.preventDefault();
    });
    document.addEventListener('click', function (event) {
        var button = event.target.closest('[data-chat-emoji]');
        if (!button) return;
        event.preventDefault();
        var input = document.getElementById('dialog-text-input');
        if (!input) return;
        var emoji = button.getAttribute('data-chat-emoji');
        var start = input.selectionStart;
        var end = input.selectionEnd;
        input.setRangeText(emoji, start, end, 'end');
        // Notify Vue's v-model so sending and saving use the updated text.
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus({ preventScroll: true });
        input.setSelectionRange(start + emoji.length, start + emoji.length);
    });
}());
