// dom-helpers.js
import { bibleBooks, booksByCname } from "./bible-books.js";
import { appState, getXrefs  } from "./app-state.js"

export const dom = {
    brandText: document.getElementById("brand-text"),
    caption: document.getElementById("brand-caption"),
    sidebar: document.getElementById("sidebar-col"),
    viewContainer: document.getElementById("content-col"),
    viewBody: document.getElementById("view-body"),
    viewTitle: document.getElementById("view-title"),
    viewMenu: document.getElementById("view-menu"),
    highlightBox: document.getElementById("highlight-box"),
    historyBox: document.getElementById("history-box"),
    selectorOT: document.querySelector("#selector-ot"),
    selectorNT: document.querySelector("#selector-nt")
};

export const HIGHLIGHTS = {
    stress: {
        key: "1",
        cssClass: "hl-stress",
        label: "主色"
    },
    gist: {
        key: "2",
        cssClass: "hl-gist",
        label: "重点"
    },
    reference: {
        key: "3",
        cssClass: "hl-reference",
        label: "参考"
    },
    keyword: {
        key: "4",
        cssClass: "hl-keyword",
        label: "关键词"
    },
    reverse: {
        key: "0",
        cssClass: "hl-reverse",
        label: "高亮",
        transient: true
    }
};

export function stripHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || "";
}

export function setViewTitle(title) {
    dom.viewTitle.innerHTML = `<div>${title}</div>`;
}

export function toSuperscript(num) {
    const map = "⁰¹²³⁴⁵⁶⁷⁸⁹";
    return num.replace(/\d/g, d => map[d]);
}

// fhl tag helpers
export function convertFhlTags(text) {
    let out = "";
    let i = 0;

    text = text.replace(/\u3000/g, " ");

    while (i < text.length) {
        if (text[i] === "<") {
            const j = text.indexOf(">", i);
            if (j === -1) break;

            const tag = text.slice(i + 1, j); // e.g. WH0430, WAH09002, WTH8804

            // Match ANY tag starting with W
            if (/^W[A-Z]+\d+$/i.test(tag)) {
                const strong = tag; // the whole thing, e.g. WH0430
                out += `<sup class="strong-number"
                             data-strong="${strong}"
                             style="cursor:pointer;">${strong}</sup>`;
            }

            i = j + 1;
        } else {
            out += text[i];
            i++;
        }
    }

    out = out.replace(/(\{|\})/g, "");

    return out;
}

export function highlightBeforeStrong(html, sn) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;

    const target = wrapper.querySelector(`sup[data-strong="${sn}"]`);
    if (!target) return html;

    let node = target.previousSibling;
    const collected = [];

    while (node) {
        if (
            node.nodeType === 1 &&
            node.tagName === 'SUP' &&
            node.dataset.strong
        ) break;

        collected.push(node);
        node = node.previousSibling;
    }

    if (collected.length) {
        const mark = document.createElement('mark');
        collected.reverse().forEach(n => mark.appendChild(n));
        target.parentNode.insertBefore(mark, target);
    }

    return wrapper.innerHTML;
}

export function highlightKeyword(text, keyword) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${escaped})`, 'gi');
    return text.replace(re, '<mark>$1</mark>');
}

// -------------------------
// parse bible references
// -------------------------
const bookPattern = Object.keys(booksByCname)
    .sort((a, b) => b.length - a.length)
    .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

const crossRefRegex = new RegExp(
    `^[#]?(?:${bookPattern})`,
    "i"
);

export function parseCrossRefs(html) {
    return html.replace(
        /([（(])([^）)]*)([）)])/g,
        (full, open, inside, close) => {

            const content = inside.trim();

            // Only parse if it starts with:
            // Gen...
            // 出...
            // #太...
            if (!crossRefRegex.test(content)) {
                return full;
            }

            const refs = parseRefs(content);

            if (!refs.length) {
                return full;
            }

            return `（${buildRefLinks(refs)}）`;
        }
    );
}

function parseRefs(str) {
    if (!str || typeof str !== "string") {
        return [];
    }

    // Supports:
    // #太4:1-11;可1:12-13|
    const text = str
        .trim()
        .replace(/^#\s*/, "")
        .replace(/\|\s*$/, "");

    const aliases = Object.keys(booksByCname)
        .filter(k => k && k !== "undefined")
        .sort((a, b) => b.length - a.length);

    if (!aliases.length) {
        return [];
    }

    const bookRegex = new RegExp(
        aliases.map(escapeRegex).join("|"),
        "gi"
    );

    const bookMatches = [];
    let match;

    while ((match = bookRegex.exec(text)) !== null) {
        const rawBook = match[0];
        const before = text[match.index - 1] || "";
        const after = text.slice(match.index + rawBook.length);

        // Book must be at start or after a separator
        const validBefore =
            match.index === 0 ||
            /[\s,;#|（(]/.test(before);

        // Book must be followed by chapter:verse
        // Allows:
        // 出 4:22
        // 出4:22
        // Gen 1:1
        // gen1:1
        const validAfter = /^\s*\d+\s*:/.test(after);

        if (!validBefore || !validAfter) {
            continue;
        }

        const bookObj =
            booksByCname[rawBook] ||
            booksByCname[rawBook.toLowerCase()];

        if (!bookObj) {
            continue;
        }

        bookMatches.push({
            index: match.index,
            end: match.index + rawBook.length,
            bookObj
        });
    }

    const refs = [];

    for (let i = 0; i < bookMatches.length; i++) {
        const current = bookMatches[i];
        const next = bookMatches[i + 1];

        const segmentStart = current.end;
        const segmentEnd = next ? next.index : text.length;
        const segment = text.slice(segmentStart, segmentEnd);

        refs.push(...extractChapterVerseRefs(segment, current.bookObj));
    }

    return refs;
}

function extractChapterVerseRefs(segment, bookObj) {
    const refs = [];

    if (!segment) {
        return refs;
    }

    // Finds:
    // 4:22
    // 4:22-23
    // 4:22–23
    // 4:22—23
    //
    // Also supports:
    // 路 1:35, 3:22
    // Gen 1:1-2 2:2 afasdfasdfasd
    const refRegex = /(\d+)\s*:\s*(\d+)(?:\s*[-–—]\s*(\d+))?/g;

    let match;

    while ((match = refRegex.exec(segment)) !== null) {
        const chapter = Number(match[1]);
        const verseStart = Number(match[2]);
        const verseEnd = match[3] ? Number(match[3]) : verseStart;

        if (
            !Number.isFinite(chapter) ||
            !Number.isFinite(verseStart) ||
            !Number.isFinite(verseEnd)
        ) {
            continue;
        }

        refs.push({
            bookId: bookObj.id,
            bookName: bookObj.name,
            cname: bookObj.cname,
            chapter,
            verseStart,
            verseEnd
        });
    }

    return refs;
}

function buildRefLinks(refs) {
    return refs.map(r => {
        const label =
            `${r.cname} ${r.chapter}:${r.verseStart}` +
            (r.verseEnd !== r.verseStart ? `-${r.verseEnd}` : "");

        return (
            '<a class="xref-link"' +
            ` data-book-id="${r.bookId}"` +
            ` data-chapter="${r.chapter}"` +
            ` data-verse-start="${r.verseStart}"` +
            ` data-verse-end="${r.verseEnd}">` +
            label +
            '</a>'
        );
    }).join("; ");
}

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function updateXrefs() {

    const xrefs = getXrefs();
    xrefs.splice(0);

    document.querySelectorAll(".xref-link").forEach(link => {

        const parent = link.closest('[class*="hl-"]');

        const hlClass = parent
            ? [...parent.classList].find(c => c.startsWith("hl-"))
            : null;

        const highlight = hlClass
            ? hlClass.slice(3)
            : "";

        link.dataset.highlight = highlight;

        xrefs.push({
            bookId: Number(link.dataset.bookId),
            chapter: Number(link.dataset.chapter),
            start: Number(link.dataset.verseStart),
            end: Number(link.dataset.verseEnd),
            highlight
        });
    });
}

// convert table to card
const BREAKPOINT = 992;

export function createCardForTable() {
    document.querySelectorAll('table').forEach((table, index) => {

        // Create card container
        const cardContainer = document.createElement('div');
        cardContainer.className = 'mobile-table-cards';
        cardContainer.dataset.tableId = index;

        // Build cards
        const headers = [...table.querySelectorAll('thead th')]
            .map(th => th.textContent.trim());

        // Optional caption
        const caption = table.querySelector('caption');
        if (caption) {
            cardContainer.insertAdjacentHTML(
                'beforeend',
                `<h5>${caption.innerHTML}</h5>`
            );
        }

        table.querySelectorAll('tbody tr').forEach(row => {

            const cells = row.querySelectorAll('td');

            let html = `
                    <div class="card mb-3 shadow-sm">
                        <div class="card-body">
                `;

            cells.forEach((cell, i) => {

                html += `
                        <div class="mb-3">
                            <div>
                                <h6>${headers[i] || ''}</h6>
                            </div>
    
                            <div>
                                ${cell.innerHTML}
                            </div>
                        </div>
                    `;
            });

            html += `
                        </div>
                    </div>
                `;

            cardContainer.insertAdjacentHTML('beforeend', html);
        });

        // Insert after table
        table.insertAdjacentElement('afterend', cardContainer);

        // Link them together
        table._cardContainer = cardContainer;
    });

    updateResponsiveTables();
}

export function updateResponsiveTables() {

    const mobile = window.innerWidth < BREAKPOINT;

    document.querySelectorAll('table').forEach(table => {

        if (!table._cardContainer) return;

        table.style.display = mobile ? 'none' : '';

        table._cardContainer.style.display =
            mobile ? '' : 'none';
    });
}

// logo helpers
export function setPageTitle(text = null) {
    if (text) {
        dom.caption.textContent = text;
        dom.caption.setAttribute("visibility", "visible");
        dom.brandText.setAttribute("visibility", "hidden");
    }
    else {
        dom.caption.setAttribute("visibility", "hidden");
        dom.brandText.setAttribute("visibility", "visible");
    }
}

export async function createLogo() {
    const svg = await fetch('/img/logo.svg')
        .then(r => r.text());

    const logoContainer = document.querySelector(".navbar-brand");
    logoContainer.innerHTML = svg;

    dom.brandText = document.getElementById("brand-text");
    dom.caption = document.getElementById("brand-caption");
}

// current highlight color
export function selectHighlightColor(code) {
    const radio = document.querySelector(
        `input[name="highlightColor"][value="${code}"]`
    );

    if (radio) {
        radio.checked = true;
        appState.currentHighlightColor = code;
    }
}

//
// build dom
//
function renderHighlightSelector() {
    const container = document.getElementById("highlight-color-selector");

    container.innerHTML = Object.entries(HIGHLIGHTS)
        .map(([value, h]) => `
            <input
                type="radio"
                class="btn-check"
                name="highlightColor"
                id="hl-${value}"
                value="${value}"
                autocomplete="off">

            <label class="btn btn-outline-secondary"
                   for="hl-${value}">
                 <span class="badge rounded-pill hl-${value}-preview">&nbsp;</span>
                ${h.label}
            </label>
        `)
        .join("");
}

renderHighlightSelector();
await createLogo();

// events
document.querySelectorAll('#highlight-color-selector input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', () => {
        const code = radio.value;

        appState.currentHighlightColor = code;
    });
});

window.addEventListener('resize', updateResponsiveTables);