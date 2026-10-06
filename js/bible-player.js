// bible-player.js

import { appState, getChapter } from "./app-state.js";
import { ttsPlayer } from "./tts-player.js";

let _player = null;

class BiblePlayer {

    constructor(audioElement, buttonElement) {
        this.audio = audioElement || new Audio();
        this.button = buttonElement;

        this.mode = null;

        this.currentMp3Url = null;
        this.currentRecords = null;

        this.currentBookId = null;
        this.currentChapter = null;
        this.currentVersion = null;

        this._wireButton();
    }

    _needsReload() {
        return (
            this.currentBookId !== appState.currentBook.id ||
            this.currentChapter !== appState.currentChapter ||
            this.currentVersion !== appState.version
        );
    }

    _updateButton() {

        if (!this.button) return;

        const isPlaying =
            (this.mode === "tts" && ttsPlayer.speaking) ||
            (this.mode === "mp3" && !this.audio.paused);

        const icon = isPlaying
            ? "fa-pause"
            : "fa-play";

        const caption = isPlaying
            ? "暂停"
            : "播放";

        const version = isPlaying
            ? this.currentVersion
            : appState.version;

        this.button.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        ${caption} (${version.toUpperCase()})
    `;
    }

    _wireButton() {

        if (!this.button) return;

        this._updateButton();

        this.button.onclick = async () => {

            if (!this.mode) {

                await this.playChapter({
                    onStart: () => this._updateButton(true),
                    onEnd: () => this._updateButton(false)
                });

                return;
            }

            this.toggle({
                onStart: () => this._updateButton(),
                onEnd: () => this._updateButton()
            });
        };
    }

    async playChapter(callbacks = {}) {

        this.currentBookId = appState.currentBook.id;
        this.currentChapter = appState.currentChapter;
        this.currentVersion = appState.version;

        const bookId = this.currentBookId;
        const chapter = this.currentChapter;

        if (appState.version === "unv") {

            try {

                const data = await fetch(
                    `https://bible.fhl.net/json/au.php?bid=${bookId}&chap=${chapter}`
                ).then(r => r.json());

                if (data.mp3) {
                    this.currentMp3Url = data.mp3;
                    this.playMp3(data.mp3, callbacks);
                    return;
                }

            } catch {
            }
        }

        this.currentRecords = getChapter(
            appState.currentBook,
            appState.currentChapter,
            appState.version
        ).map(v => ({
            ...v,
            bible_text: v.bible_text.replace(/<[^>]*>/g, "")
        }));

        this.mode = "tts";

        ttsPlayer.playRecords(
            this.currentRecords,
            callbacks
        );
    }

    playMp3(url, callbacks = {}) {

        this.mode = "mp3";
        this.audio.src = url;

        this.audio.onplay = () =>
            callbacks.onStart?.();

        this.audio.onended = () => {
            this.mode = null;
            callbacks.onEnd?.();
        };

        this.audio.onerror = e =>
            callbacks.onError?.(e);

        this.audio.play();
    }

    toggle(callbacks = {}) {

        if (this._needsReload()) {
            this.stop();
            this.playChapter(callbacks);
            return;
        }

        if (this.mode === "mp3") {
            if (!this.audio.paused) {
                this.audio.pause();
                callbacks.onEnd?.();
            } else {
                this.audio.play();
                callbacks.onStart?.();
            }
        }

        else if (this.mode === "tts") {

            ttsPlayer.toggleRecords(
                this.currentRecords,
                callbacks
            );
        }
    }

    stop() {

        if (this.mode === "mp3") {

            this.audio.pause();
            this.audio.currentTime = 0;
        }

        else if (this.mode === "tts") {

            ttsPlayer.stop();
        }
    }

    reset() {

        this.stop();

        this.mode = null;
        this.currentRecords = null;
        this.currentMp3Url = null;
    }
}

export function getBiblePlayer({
    audioElement = null,
    buttonElement
}) {

    if (!_player) {

        _player = new BiblePlayer(
            audioElement,
            buttonElement
        );

    } else {

        _player.audio = audioElement;

        if (buttonElement) {
            _player.button = buttonElement;
            _player._wireButton();
        }
    }

    return _player;
}