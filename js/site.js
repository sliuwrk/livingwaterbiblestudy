// site.js (ES Module)

import { bibleBooks, bookSections, sectionTitles } from "./bible-books.js";
import { dom, setPageTitle, selectHighlightColor, HIGHLIGHTS } from "./dom-helpers.js";
import { appState, addSearch, setCurrentBook, loadSavedBook, popBibleView, getNoteInfo } from "./app-state.js";
import { initBibleView } from "./bible.js";
import { initBookmarkView } from "./bookmark.js";
import { initSearchView } from "./search.js";
import { initNoteView } from "./note.js";
import { loadHistory } from "./store.js";

const { viewContainer, viewBody, viewMenu, viewTitle, sidebar, selectorOT, selectorNT } = dom;

// ============================
// STATE
// ============================
let currentView = "";

// ============================
// VIEW functions
// ============================
const scrollPositions = {};

function navigate(page) {
    if (page != currentView) {
        history.pushState({ page }, "", `#${page}`);
    }

    loadView(page);
}

// LOAD VIEW (CORE SPA)
async function loadView(page) {
    if (page === currentView && page !== "bible") return;

    // save outgoing view scroll position
    if (currentView) {
        scrollPositions[currentView] = window.scrollY;
    }

    currentView = page;

    const html = await fetch(`/views/${page}.html?v=1.0`).then(r => r.text());

    const vw = document.createElement("div");
    vw.innerHTML = html;

    // extract sections
    const title = vw.querySelector(`section[name="view-title"]`);
    const menu = vw.querySelector(`section[name="view-menu"]`);
    const body = vw.querySelector(`section[name="view-body"]`);

    // inject into layout
    viewTitle.innerHTML = title ? title.innerHTML : "";
    viewMenu.innerHTML = menu ? menu.innerHTML : "";
    viewBody.innerHTML = body ? body.innerHTML : "";

    // init view AFTER DOM injection
    initView(page);

    // restore saved scroll; bible manages its own via scrollToCurrentVerse()
    if (page !== "bible") {
        window.scrollTo(0, scrollPositions[page] ?? 0);
    }
}

function initView(page) {
    switch (page) {
        case "bible":
            initBibleView(viewContainer);
            setPageTitle(`${appState.currentBook.name} ${appState.currentChapter}`);
            break;

        case "search":
            initSearchView(viewContainer);
            setPageTitle();
            break;

        case "note":
            initNoteView(viewContainer);
            setPageTitle();
            break;

        case "home":
        default:
            setPageTitle();
            break;
    }
}


// ============================
// ACTION HANDLER (NAVBAR)
// ============================

const actions = {

    "load-content": (e) => {
        // prevent collapse-triggered clicks from navigating
        if (!e.isTrusted) return;  // only real user clicks

        e.preventDefault();
        collapseUI();

        const page = (e.target.getAttribute("href")).replace(/^#/, "").trim();

        initUI(page);
        if (page) navigate(page);
    },

    "toggle-sidebar": (e) => {
        e.preventDefault();
        sidebar.classList.toggle("collapsed");
    }
};

function initUI(page) {
    if (page == "bible" && currentView == "bible") {
        sidebar.classList.toggle("collapsed");
    }
}
//
// sidebar
//
function populateBooks() {

    // Clear containers
    selectorOT.innerHTML = "";
    selectorNT.innerHTML = "";

    // Build OT sections
    ["law", "history", "poetry", "major", "minor"].forEach(section => {
        const books = bookSections[section];

        const html = `
            <div class="selector-section mb-3">
                <h6>${sectionTitles[section]}</h6>
                <div class="selector-books">
                    ${books.map(id => createBookBlock(bibleBooks[id - 1])).join("")}
                </div>
            </div>
        `;

        selectorOT.insertAdjacentHTML("beforeend", html);
    });

    // Build NT sections
    ["gospel", "acts", "paul", "general", "jude", "revelation"].forEach(section => {
        const books = bookSections[section];

        const html = `
            <div class="selector-section mb-3">
                <h6>${sectionTitles[section]}</h6>
                <div class="selector-books">
                    ${books.map(id => createBookBlock(bibleBooks[id - 1])).join("")}
                </div>
            </div>
        `;

        selectorNT.insertAdjacentHTML("beforeend", html);
    });
}

function createBookBlock(book) {
    const chapters = Array.from(
        { length: book.chapters },
        (_, i) => `<a data-chapter="${i + 1}" data-book="${book.id}">${i + 1}</a>`
    ).join("");

    return `
        <div class="book-wrapper">
            <a class="book-item" data-book="${book.id}">${book.name}</a>
            <div class="chapter-box" id="chapters-${book.id}">
                ${chapters}
            </div>
        </div>
    `;
}

// 
// helpers
// 
function collapseUI() {
    // collapse only on mobile
    if (window.innerWidth > 768) return;

    sidebar.classList.add("collapsed");

    const bsMenu = document.querySelector(".navbar-collapse.show");
    if (bsMenu) {
        const inst = bootstrap.Collapse.getInstance(bsMenu);
        if (inst) inst.hide();
    }
}

function registerEvents() {
    // 
    // BIND NAVBAR ACTIONS
    // 
    document.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;

        const action = btn.dataset.action;
        if (actions[action]) {
            actions[action](e);
        }
    });

    // 
    // SPA NAVIGATION EVENTS
    // 
    document.addEventListener("go-to-search", (e) => {
        navigate("search");

        const { sn } = e.detail || {};

        if (sn) {
            addSearch('strong', sn);
        }
    });

    document.addEventListener("go-to-bible", (e) => {
        navigate("bible");
        collapseUI();
    });

    document.getElementById('fontRange').addEventListener('input', e => {
        const size = e.target.value + "px";
        viewBody.style.fontSize = size;

        localStorage.setItem("fontSize", size);
    });

    //
    // SIDEBAR BIBLE SELECTOR EVENTS
    //
    sidebar.addEventListener("click", (e) => {

        // BOOK CLICK → toggle chapter box
        const selBook = e.target.closest(".book-item");
        if (selBook) {
            const idx = Number(selBook.dataset.book);

            // close all other chapter boxes
            document.querySelectorAll(".chapter-box").forEach(box => {
                if (box.id !== `chapters-${idx}`) box.style.display = "none";
            });

            // toggle this one
            const box = document.getElementById(`chapters-${idx}`);
            box.style.display = box.style.display === "flex" ? "none" : "flex";
            return;
        }

        // CHAPTER CLICK → navigate
        const selChap = e.target.closest(".chapter-box a[data-chapter]");
        if (selChap) {
            const bookId = Number(selChap.dataset.book);
            const book = bibleBooks.find(b => b.id === bookId);
            const chapter = Number(selChap.dataset.chapter);

            setCurrentBook(book, chapter);
            document.dispatchEvent(new CustomEvent("go-to-bible"));
            return;
        }
    });

    //
    // bs events
    //
    document.addEventListener('shown.bs.collapse', e => {
        const btn = document.querySelector(`[data-bs-target="#${e.target.id}"]`);
        if (!btn) return;

        // Only modify buttons that contain ONLY an <i> tag
        if (btn.children.length === 1 && btn.children[0].tagName === 'I') {
            btn.children[0].className = "fa-solid fa-chevron-up";
        }
    });

    document.addEventListener('hidden.bs.collapse', e => {
        const btn = document.querySelector(`[data-bs-target="#${e.target.id}"]`);
        if (!btn) return;

        // Only modify buttons that contain ONLY an <i> tag
        if (btn.children.length === 1 && btn.children[0].tagName === 'I') {
            btn.children[0].className = "fa-solid fa-chevron-down";
        }
    });

    // 
    // viewContainer XREF CLICK
    // 
    viewContainer.addEventListener("click", e => {
        const link = e.target.closest(".xref-link");
        if (!link) return;

        const book = bibleBooks.find(b => b.id == link.dataset.bookId);
        const chapter = parseInt(link.dataset.chapter, 10);
        const start = parseInt(link.dataset.verseStart, 10);
        const end = link.dataset.verseEnd ? parseInt(link.dataset.verseEnd, 10) : null;
        const highlight = 'reverse';

        setCurrentBook(book, chapter, start, { start: start, end: end, highlight: highlight });
        document.dispatchEvent(new CustomEvent("go-to-bible"));
    });

    viewContainer.addEventListener("click", e => {
        collapseUI();
    });

    document.addEventListener("keydown", (e) => {
        // Ignore shortcuts when typing
        const tag = document.activeElement?.tagName;
        if (
            tag === "INPUT" ||
            tag === "TEXTAREA" ||
            document.activeElement?.isContentEditable
        ) {
            return;
        }

        const key = e.key.toLowerCase();

        // Highlight colors
        const keyToHighlight = Object.fromEntries(
            Object.entries(HIGHLIGHTS).map(([name, h]) => [h.key, name])
        );
        const code = keyToHighlight[key];
        if (code) {
            selectHighlightColor(code);
            return;
        }

        switch (key) {
            // Sidebar tabs


            // Main views
            case "b":
                const info = getNoteInfo();
                setCurrentBook(info.book, info.chapter);
                navigate("bible")
                break;

            case "r":
                navigate("note")
                break;
        }
    });

    window.addEventListener("popstate", (e) => {

        const state = e.state;
        if (!state) return;

        if (state.page != currentView && state.page != "bible") {
            loadView(state.page);
            return;
        }

        popBibleView(state);
    });
}

// ============================
// INITIAL LOAD
// ============================
function restoreSettings() {
    const savedFontSize = localStorage.getItem("fontSize");

    if (savedFontSize) {
        viewBody.style.fontSize = savedFontSize;
        // Sync slider position (strip "px")
    }
    document.getElementById('fontRange').value = parseInt(viewBody.style.fontSize);
}

populateBooks();
initBookmarkView();
loadSavedBook();
navigate("bible");
registerEvents();
restoreSettings();