import { saveArticle, getAllSavedArticles, deleteSavedArticle } from './db.js';

// 1. Реєстрація Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
            console.error('SW registration failed:', err);
        });
    });
}

// 2. Кнопка встановлення PWA (Install Prompt)
let deferredPrompt;
const installBtn = document.getElementById('installBtn');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.classList.remove('hidden');
});

installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.classList.add('hidden');
});

// 3. Відстеження статусу мережі (Online / Offline)
const networkStatus = document.getElementById('networkStatus');

function updateNetworkStatus() {
    if (navigator.onLine) {
        networkStatus.textContent = 'Online';
        networkStatus.className = 'status-pill online';
    } else {
        networkStatus.textContent = 'Offline (Cache + IndexedDB)';
        networkStatus.className = 'status-pill offline';
    }
}

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
updateNetworkStatus();

// 4. Перемикання вкладок
const tabBtns = document.querySelectorAll('.tab-btn');
const searchSection = document.getElementById('searchSection');
const savedSection = document.getElementById('savedSection');

tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
        tabBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        if (btn.dataset.tab === 'search') {
            searchSection.classList.add('active');
            savedSection.classList.remove('active');
        } else {
            savedSection.classList.add('active');
            searchSection.classList.remove('active');
            renderSavedArticles();
        }
    });
});

// 5. Пошук через Crossref REST API
const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const searchStatus = document.getElementById('searchStatus');

let currentSearchItems = [];
let savedMap = new Map();

async function refreshSavedCache() {
    const saved = await getAllSavedArticles();
    savedMap = new Map(saved.map((item) => [item.doi, item]));
    document.getElementById('savedCount').textContent = saved.length;
}

async function performSearch(query) {
    searchStatus.classList.remove('hidden');
    searchStatus.textContent = 'Завантаження статей із Crossref API...';
    searchResults.innerHTML = '';

    const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=10&select=DOI,title,author,published,container-title,URL`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network error');

        const data = await response.json();
        currentSearchItems = (data.message.items || []).map((item) => ({
            doi: item.DOI,
            title: item.title?.[0] || 'Без назви',
            authors: item.author
                ? item.author.slice(0, 4).map((a) => `${a.given || ''} ${a.family || ''}`.trim()).join(', ')
                : 'Автори не вказані',
            journal: item['container-title']?.[0] || 'Наукове видання',
            year: item.published?.['date-parts']?.[0]?.[0] || '—',
            url: item.URL || `https://doi.org/${item.DOI}`
        }));

        searchStatus.textContent = navigator.onLine
            ? `Знайдено ${currentSearchItems.length} статей за запитом «${query}» (відповідь закешовано у SW).`
            : `Офлайн-режим: показано збережену в Cache Storage відповідь для «${query}».`;

        renderSearchResults();
    } catch (err) {
        searchStatus.textContent =
            'Немає з’єднання з мережею, а цей запит ще не був закешований. Перейдіть у вкладку «Моя добірка» для роботи з IndexedDB.';
    }
}

function renderSearchResults() {
    searchResults.innerHTML = '';
    currentSearchItems.forEach((article) => {
        const isSaved = savedMap.has(article.doi);
        const card = document.createElement('article');
        card.className = 'card';
        card.innerHTML = `
      <div class="card-meta">
        <span>${article.journal} • ${article.year}</span>
        <span>DOI: ${article.doi}</span>
      </div>
      <div class="card-title">${article.title}</div>
      <div class="card-authors">${article.authors}</div>
      <div class="card-actions">
        <button class="btn ${isSaved ? 'btn-outline' : 'btn-primary'} save-btn" data-doi="${article.doi}">
          ${isSaved ? 'Редагувати конспект' : '+ Зберегти в IndexedDB'}
        </button>
        <a href="${article.url}" target="_blank" rel="noopener" class="btn btn-outline">Джерело ↗</a>
      </div>
    `;
        searchResults.appendChild(card);
    });

    document.querySelectorAll('.save-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const article = currentSearchItems.find((a) => a.doi === btn.dataset.doi);
            openNoteModal(article);
        });
    });
}

searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (q) performSearch(q);
});

document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
        searchInput.value = chip.dataset.query;
        performSearch(chip.dataset.query);
    });
});

// 6. Робота з модальним вікном та IndexedDB
const noteModal = document.getElementById('noteModal');
const noteForm = document.getElementById('noteForm');
const modalArticleName = document.getElementById('modalArticleName');
const tagInput = document.getElementById('tagInput');
const noteInput = document.getElementById('noteInput');
const cancelModalBtn = document.getElementById('cancelModalBtn');

let activeArticle = null;

function openNoteModal(article) {
    activeArticle = article;
    const existing = savedMap.get(article.doi);
    modalArticleName.textContent = article.title;
    tagInput.value = existing?.tag || 'Дослідження';
    noteInput.value = existing?.note || '';
    noteModal.showModal();
}

cancelModalBtn.addEventListener('click', () => noteModal.close());

noteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeArticle) return;

    await saveArticle({
        ...activeArticle,
        tag: tagInput.value.trim(),
        note: noteInput.value.trim()
    });

    noteModal.close();
    await refreshSavedCache();
    renderSearchResults();
    renderSavedArticles();
});

// 7. Рендер збережених статей із IndexedDB
const savedResults = document.getElementById('savedResults');
const filterInput = document.getElementById('filterInput');

async function renderSavedArticles() {
    const all = await getAllSavedArticles();
    const filter = filterInput.value.trim().toLowerCase();

    const filtered = all.filter(
        (item) =>
            item.title.toLowerCase().includes(filter) ||
            item.tag.toLowerCase().includes(filter) ||
            (item.note && item.note.toLowerCase().includes(filter))
    );

    savedResults.innerHTML = '';

    if (filtered.length === 0) {
        savedResults.innerHTML = '<div class="info-banner">У базі IndexedDB поки немає збережених статей за цим фільтром.</div>';
        return;
    }

    filtered.forEach((article) => {
        const card = document.createElement('article');
        card.className = 'card';
        card.innerHTML = `
      <div class="card-meta">
        <span class="tag-badge">#${article.tag}</span>
        <span>${article.journal} • ${article.year}</span>
      </div>
      <div class="card-title">${article.title}</div>
      <div class="card-authors">${article.authors}</div>
      ${article.note ? `<div class="note-box"><strong>Конспект:</strong> ${article.note}</div>` : ''}
      <div class="card-actions">
        <button class="btn btn-outline edit-saved-btn" data-doi="${article.doi}">Редагувати</button>
        <button class="btn btn-danger delete-saved-btn" data-doi="${article.doi}">Видалити з БД</button>
        <a href="${article.url}" target="_blank" rel="noopener" class="btn btn-outline">Джерело ↗</a>
      </div>
    `;
        savedResults.appendChild(card);
    });

    document.querySelectorAll('.edit-saved-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const article = savedMap.get(btn.dataset.doi);
            if (article) openNoteModal(article);
        });
    });

    document.querySelectorAll('.delete-saved-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
            await deleteSavedArticle(btn.dataset.doi);
            await refreshSavedCache();
            renderSavedArticles();
            renderSearchResults();
        });
    });
}

filterInput.addEventListener('input', renderSavedArticles);

// Ініціалізація при старті
(async () => {
    await refreshSavedCache();
    performSearch('Data Science');
})();