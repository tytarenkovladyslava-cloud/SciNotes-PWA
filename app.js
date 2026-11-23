// 1. Реєстрація Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
}

// 2. Індикатор Online / Offline
const statusEl = document.getElementById('status');
function updateStatus() {
    statusEl.textContent = navigator.onLine ? 'Online' : 'Offline';
    statusEl.className = navigator.onLine ? 'badge online' : 'badge offline';
}
window.addEventListener('online', updateStatus);
window.addEventListener('offline', updateStatus);
updateStatus();

// 3. Відкриття бази даних IndexedDB
let db;
let cards = [];
let currentIndex = 0;

const request = indexedDB.open('FlashCardsDB', 1);
request.onupgradeneeded = (e) => {
    db = e.target.result;
    db.createObjectStore('cards', { keyPath: 'id', autoIncrement: true });
};
request.onsuccess = (e) => {
    db = e.target.result;
    loadCards();
};

// 4. Запит до Dictionary API за першим визначенням і першим прикладом
async function fetchWordDetails(word) {
    try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
        if (!res.ok) return { phonetic: '', definition: '', example: '' };
        const data = await res.json();
        const entry = data[0];

        const phonetic = entry.phonetic || '';
        let definition = '';
        let example = '';

        for (const meaning of entry.meanings || []) {
            for (const def of meaning.definitions || []) {
                if (!definition && def.definition) {
                    definition = def.definition;
                }
                if (!example && def.example) {
                    example = def.example;
                }
                if (definition && example) break;
            }
            if (definition && example) break;
        }

        return { phonetic, definition, example };
    } catch {
        return { phonetic: '', definition: '', example: '' };
    }
}

// 5. Додавання картки в IndexedDB
document.getElementById('cardForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const wordInput = document.getElementById('wordInput');
    const transInput = document.getElementById('transInput');
    const addBtn = document.getElementById('addBtn');

    const word = wordInput.value.trim();
    const translation = transInput.value.trim();
    if (!word || !translation) return;

    addBtn.disabled = true;
    addBtn.textContent = 'Завантаження...';

    const { phonetic, definition, example } = await fetchWordDetails(word);

    const tx = db.transaction('cards', 'readwrite');
    tx.objectStore('cards').add({ word, translation, phonetic, definition, example });

    tx.oncomplete = () => {
        wordInput.value = '';
        transInput.value = '';
        addBtn.disabled = false;
        addBtn.textContent = 'Додати картку';
        currentIndex = cards.length;
        loadCards();
    };
});

// 6. Читання карток з IndexedDB та оновлення інтерфейсу
function loadCards() {
    const tx = db.transaction('cards', 'readonly');
    tx.objectStore('cards').getAll().onsuccess = (e) => {
        cards = e.target.result;
        document.getElementById('totalCount').textContent = cards.length;
        renderTrainer();
        renderList();
    };
}

function renderTrainer() {
    const trainer = document.getElementById('trainerSection');
    if (cards.length === 0) {
        trainer.classList.add('hidden');
        return;
    }
    trainer.classList.remove('hidden');
    if (currentIndex >= cards.length) currentIndex = cards.length - 1;

    const card = cards[currentIndex];
    document.getElementById('flashcard').classList.remove('flipped');
    document.getElementById('frontWord').textContent = card.word;
    document.getElementById('frontPhonetic').textContent = card.phonetic || '';
    document.getElementById('backTrans').textContent = card.translation;

    const defEl = document.getElementById('backDef');
    defEl.textContent = card.definition || '';
    defEl.classList.toggle('hidden', !card.definition);

    const exEl = document.getElementById('backExample');
    exEl.textContent = card.example ? `"${card.example}"` : '';
    exEl.classList.toggle('hidden', !card.example);

    document.getElementById('counter').textContent = `${currentIndex + 1} / ${cards.length}`;
}

function renderList() {
    const list = document.getElementById('cardsList');
    list.innerHTML = '';
    cards.forEach((c) => {
        const li = document.createElement('li');
        li.innerHTML = `
      <div class="item-info">
        <strong>${c.word}</strong> — ${c.translation}
        ${c.definition ? `<small>${c.definition}</small>` : ''}
        ${c.example ? `<small><em>"${c.example}"</em></small>` : ''}
      </div>
    `;
        const delBtn = document.createElement('button');
        delBtn.textContent = '✕';
        delBtn.className = 'del-btn';
        delBtn.onclick = () => {
            const tx = db.transaction('cards', 'readwrite');
            tx.objectStore('cards').delete(c.id);
            tx.oncomplete = loadCards;
        };
        li.appendChild(delBtn);
        list.appendChild(li);
    });
}

// 7. Перевертання картки, озвучка та навігація
document.getElementById('flashcard').addEventListener('click', (e) => {
    if (e.target.id !== 'speakBtn') {
        document.getElementById('flashcard').classList.toggle('flipped');
    }
});

document.getElementById('speakBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const utterance = new SpeechSynthesisUtterance(cards[currentIndex].word);
    utterance.lang = 'en-US';
    speechSynthesis.speak(utterance);
});

document.getElementById('prevBtn').addEventListener('click', () => {
    currentIndex = (currentIndex - 1 + cards.length) % cards.length;
    renderTrainer();
});

document.getElementById('nextBtn').addEventListener('click', () => {
    currentIndex = (currentIndex + 1) % cards.length;
    renderTrainer();
});