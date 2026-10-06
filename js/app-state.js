// app-state.js (ES module)
import { bibleBooks, booksByCname } from "./bible-books.js";
import { stripHtml } from "./dom-helpers.js";

let _inPopState = false;

export const appState = {
    currentBook: bibleBooks[0],
    currentChapter: 1,
    currentVerse: 1,
    range: null,
    version: "unv",

    searchHistory: [],
    currentHighlightColor: 'stress',

    pinnedBook: null,
    pinnedChapter: null,

    verseRange: {start: null, end: null, highlight: 'reverse'},

    bibleViewSettings: {
        mode: "single",
        showStrongNumbers: false,
        compareVersions: ["unv", "esv", "kjv", "wcb", "ofm", "rcuv", "tcv2019"],
        showVersionAbbrInCompare: true
    }
};

export function setCurrentBook(book, chapter, verse = 1, verseRange = null) {
    appState.currentBook = book;
    appState.currentChapter = chapter;
    appState.currentVerse = verse;
    appState.verseRange = verseRange;

    localStorage.setItem("currentBookId", book.id);
    localStorage.setItem("currentChapter", chapter);
}

const _chapterCache = {};

export function getChapter(book, chapter, version) {
    const key = `${book.id}-${chapter}-${version}`;
    return _chapterCache[key];
}

export function getChapterText(book, chapter, version) {
    const records = getChapter(appState.currentBook, appState.currentChapter, appState.version);
    if (!records?.length) return "";
    return records.map(v => stripHtml(v.bible_text)).join(" ");
}

export function addChapter(book, chapter, version, record) {
    const key = `${book.id}-${chapter}-${version}`;
    _chapterCache[key] = record;
}

export function addSearch(type, value) {

    // remove existing entry
    appState.searchHistory = appState.searchHistory.filter(
        x => !(x.type === type && x.value === value)
    );

    // add to top
    appState.searchHistory.unshift({ type, value });

    // optional: limit size
    appState.searchHistory = appState.searchHistory.slice(0, 20);
}

export function getVerseRange() {
    return appState.verseRange;
}

export function isInXref(verse) {
    return getXrefs().some(x =>
        x.bookId === appState.currentBook.id &&
        x.chapter === appState.currentChapter &&
        verse >= x.start &&
        verse <= x.end
    );
}

export function togglePin() {
    if (appState.pinnedBook === null) {
        appState.pinnedBook = appState.currentBook;
        appState.pinnedChapter = appState.currentChapter;
    } else {
        appState.pinnedBook = null;
        appState.pinnedChapter = null;
    }
}

export function getNoteInfo() {
    return {
        book: appState.pinnedBook ? appState.pinnedBook : appState.currentBook,
        chapter: appState.pinnedChapter || appState.currentChapter
    };
}


//
// nav history functions
//
export function isBackward() { return _inPopState; }
export function setBackward(flag = true) { _inPopState = flag; }

export function popBibleView(state) {
    setBackward(true);

    const book = bibleBooks.find(b => b.id === state.bookId);
    if (book) {
        setCurrentBook(book, state.chapter);
        appState.version = state.version;
        appState.bibleViewSettings.mode = state.mode || "single";

        document.dispatchEvent(new CustomEvent("go-to-bible"));
    }
}

export function pushStateBibleView() {
    history.pushState(
        {
            page: "bible",
            bookId: appState.currentBook.id,
            chapter: appState.currentChapter,
            version: appState.version,
            mode: appState.bibleViewSettings.mode
        },
        "",
        `#bible/${appState.currentBook.id}/${appState.currentChapter}/${appState.version}`
    );
}

export function loadSavedBook() {
    const savedId = localStorage.getItem("currentBookId");
    const savedChapter = localStorage.getItem("currentChapter");

    if (!savedId) return; // nothing saved

    const book = bibleBooks.find(b => b.id === Number(savedId));
    if (!book) return;

    appState.currentBook = book;
    appState.currentChapter = savedChapter ? Number(savedChapter) : 1;
}

// xrefs
const xrefs = [];
export function getXrefs() {
    return xrefs;
}