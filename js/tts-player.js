// tts-player.js

import { appState } from "./app-state.js";

class TTSPlayer {

    constructor() {
        this.currentUtterance = null;

        this.records = [];
        this.index = 0;

        this.language = null;
        this.voice = null;

        this.isPlaying = false;
        this.cancelled = false;

        this.callbacks = {};
    }

    getLanguage() {

        switch (appState.version.toUpperCase()) {

            case "UNV":
            case "WCB":
            case "OFM":
            case "RCUV":
            case "TCV2019":
                return "zh-CN";

            case "ESV":
            case "KJV":
                return "en-US";

            default:
                return "zh-CN";
        }
    }

    getVoice() {

        const lang = this.language;

        const voices =
            speechSynthesis.getVoices();

        return (
            voices.find(v => v.lang === lang) ||
            voices.find(v =>
                v.lang.startsWith(
                    lang.substring(0, 2)
                )
            )
        );
    }
    
    playRecords(records, callbacks = {}) {

        this.stop();

        this.records = records;
        this.index = 0;

        this.language = this.getLanguage();
        this.voice = this.getVoice();

        this.callbacks = callbacks;

        this.cancelled = false;
        this.isPlaying = true;

        this.playCurrent();
    }

    playCurrent() {

        if (this.cancelled) {
            return;
        }

        if (this.index >= this.records.length) {

            this.isPlaying = false;
            this.currentUtterance = null;

            this.callbacks.onEnd?.();

            return;
        }

        const verse =
            this.records[this.index];

        const utterance =
            new SpeechSynthesisUtterance(
                verse.bible_text
            );

        utterance.lang = this.language;

        if (this.voice) {
            utterance.voice = this.voice;
        }

        utterance.rate = 1;
        utterance.pitch = 1;

        utterance.onstart = () => {

            if (this.index === 0) {
                this.callbacks.onStart?.();
            }

            this.callbacks.onVerseStart?.(
                verse
            );
        };

        utterance.onend = () => {

            if (this.cancelled) {
                return;
            }

            this.index++;

            this.playCurrent();
        };

        utterance.onerror = (e) => {

            // expected on cancel()
            if (
                e.error === "interrupted" ||
                e.error === "canceled"
            ) {
                return;
            }

            console.error(
                "TTS Error:",
                e.error
            );

            this.isPlaying = false;
            this.currentUtterance = null;

            this.callbacks.onError?.(e);
        };

        this.currentUtterance =
            utterance;

        speechSynthesis.speak(
            utterance
        );
    }

    pause() {

        if (!this.isPlaying) {
            return;
        }

        this.cancelled = true;
        this.isPlaying = false;

        speechSynthesis.cancel();
    }

    resume(callbacks = null) {

        if (callbacks) {
            this.callbacks = callbacks;
        }

        if (
            this.records.length === 0 ||
            this.index >= this.records.length
        ) {
            return;
        }

        this.cancelled = false;
        this.isPlaying = true;

        this.playCurrent();
    }

    stop() {

        this.cancelled = true;
        this.isPlaying = false;

        this.currentUtterance = null;

        speechSynthesis.cancel();
    }

    reset() {

        this.stop();

        this.records = [];
        this.index = 0;
    }

    toggleRecords(records, callbacks = {}) {

        if (this.isPlaying) {
            this.pause();
            callbacks.onEnd?.();

            return;
        }

        // resume current chapter

        if (
            this.records.length > 0 &&
            this.index < this.records.length
        ) {
            this.resume(callbacks);
            callbacks.onStart?.();

            return;
        }

        // start new chapter

        this.playRecords(
            records,
            callbacks
        );
    }

    get speaking() {
        return this.isPlaying;
    }
}

export const ttsPlayer =
    new TTSPlayer();