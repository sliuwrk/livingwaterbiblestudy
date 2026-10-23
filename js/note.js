// study-note.js (ES module)

import { appState, setCurrentBook, getNoteInfo, togglePin } from "./app-state.js";
import { dom, setViewTitle, parseCrossRefs, createCardForTable, updateXrefs } from "./dom-helpers.js";

import { bibleBooks } from "./bible-books.js";

const { viewBody } = dom;

const _noteCache = {};
const emptyNote = '<p class="text-muted">暂无笔记。</p>';

let _viewEventBound = false;
let viewContainer = null;
let view = null;
let activeTab = "background";

// ============================
// ENTRY
// ============================
function initNoteView(container) {
    if (!viewContainer) {
        viewContainer = container;
    }

    view = getDom();

    updateNoteTitle();

    renderBoxNotes();
    updatePinButton();
    registerNotesEvents();
}

function getDom() {
    return {
        notesContainer: viewBody,
        pinButton: viewContainer.querySelector("#toggle-pin"),
        tabs: Array.from(document.querySelectorAll("#note-tabs [data-note-tab]"))
    };
}

function showNoteFor(book, chapter) {
    setCurrentBook(book, chapter);

    // a pinned note stays on screen
    if (appState.pinnedBook !== null) return;

    updateNoteTitle();
    renderBoxNotes();
    window.scrollTo({ top: 0 });
}

// ============================
// RENDER NOTES
// ============================
function renderBoxNotes() {
    const { book, chapter } = getNoteInfo();
    const key = `${book.ename}-${chapter}`;

    if (_noteCache[key]) {
        showNotes(_noteCache[key]);
        return;
    }

    fetchNotes(book.ename, chapter, key);
}

function fetchNotes(ename, chapter, key) {
    const page = `notes/${ename}/${ename}-${chapter}.html`;

    fetch(page, { cache: 'no-store'})
        .then(r => r.ok ? r.text() : Promise.reject("NOT_FOUND"))
        .then(html => {
            _noteCache[key] = parseCrossRefs(html);
            showNotes(_noteCache[key]);
        })
        .catch(() => {
            _noteCache[key] = emptyNote;
            showNotes(emptyNote);
        });
}

function showNotes(html) {
    view.notesContainer.innerHTML = html;
    createCardForTable();
    updateXrefs();
    showTab(activeTab);
}

// ============================
// TABS
// ============================
function getSections() {
    return Array.from(view.notesContainer.querySelectorAll("section[data-note-tab]"));
}

function showTab(tab) {
    const sections = getSections();
    const available = new Set(sections.map(s => s.dataset.noteTab));

    // Fall back to the first tab that has content in this chapter
    if (!available.has(tab)) {
        const firstAvailable = view.tabs.find(t => available.has(t.dataset.noteTab));
        if (firstAvailable) tab = firstAvailable.dataset.noteTab;
    }

    sections.forEach(s => {
        s.hidden = s.dataset.noteTab !== tab;
    });

    view.tabs.forEach(t => {
        const name = t.dataset.noteTab;
        const isActive = name === tab && available.has(name);
        t.classList.toggle("active", isActive);
        t.classList.toggle("disabled", !available.has(name));
        t.setAttribute("aria-selected", String(isActive));
    });
}

//
// constrol state
//
function updateNoteTitle() {
    const { book, chapter } = getNoteInfo();
    setViewTitle(`<span>${book.name}</span> <small>第 ${chapter} 章</small>`);
}

function updatePinButton() {
    view.pinButton.innerHTML = appState.pinnedBook === null
        ? `<i class="fa-solid fa-thumbtack"></i> 设为固定`
        : `<i class="fa-solid fa-thumbtack fa-rotate-90"></i> 取消固定`;
}

// ============================
// EVENTS
// ============================
function registerNotesEvents() {
    if (!_viewEventBound) {
        _viewEventBound = true;

        viewContainer.addEventListener("click", (e) => {
            const tab = e.target.closest("#note-tabs [data-note-tab]");
            if (tab) {
                if (tab.classList.contains("disabled")) return;
                activeTab = tab.dataset.noteTab;
                showTab(activeTab);
                window.scrollTo({ top: 0 });
                return;
            }

            if (!e.target.closest("#toggle-pin")) return;
            togglePin();
            updatePinButton();
            updateNoteTitle();
            renderBoxNotes();
        });
    }
}

export { initNoteView, showNoteFor }
