/**
 * MangaVerse - Dual Manga Scraper & Zero-Seam Continuous Webtoon Engine
 */

const state = {
    currentSource: 'miku', // 'miku' | 'doujinth'
    currentPage: 1,
    searchQuery: '',
    viewMode: 'latest', // 'latest' | 'featured' | 'random'
    currentManga: null,
    currentChapter: null,
    currentChapterIndex: 0,
    chapters: [],
    readChapters: new Set(),
    bookmarks: [],
    history: [],
    lastScrollY: 0,
    isBarsVisible: true,
    readerWidth: '800',
    currentTag: null
};

const POPULAR_TAGS = [
    { id: 'ภาพสี', label: '🎨 ภาพสี' },
    { id: 'Uncensored', label: '⚡ ไม่เซ็นเซอร์' },
    { id: 'นักเรียน', label: '🎓 นักเรียน' },
    { id: 'ฮาเร็ม', label: '👑 ฮาเร็ม' },
    { id: 'สาวแกล', label: '🍑 สาวแกล' },
    { id: 'แม่บ้าน', label: '🌸 แม่บ้าน' },
    { id: 'สาวใหญ่', label: '💋 สาวใหญ่' },
    { id: 'NTR', label: '💔 NTR' },
    { id: 'เพื่อนสมัยเด็ก', label: '💘 เพื่อนสมัยเด็ก' },
    { id: 'ชุดว่ายน้ำ', label: '👙 ชุดว่ายน้ำ' },
    { id: 'แฟนตาซี', label: '🧝 แฟนตาซี' },
    { id: 'สาวแว่น', label: '👓 สาวแว่น' },
    { id: 'พยาบาล', label: '💉 พยาบาล' },
    { id: 'สาวออฟฟิศ', label: '🏢 สาวออฟฟิศ' },
    { id: 'โรแมนติก', label: '💖 โรแมนติก' },
    { id: 'คอมดี้', label: '😂 คอมเมดี้' },
];

// =========================================================
// INITIALIZATION
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
    loadStoredData();
    updateBookmarkBadge();
    renderPopularTags();
    fetchCatalog(1);
    setupScrollListeners();
    setupKeyboardListeners();
});

function loadStoredData() {
    try {
        const readData = JSON.parse(localStorage.getItem('mangaverse_read') || '[]');
        state.readChapters = new Set(readData);
        state.bookmarks = JSON.parse(localStorage.getItem('mangaverse_bookmarks') || '[]');
        state.history = JSON.parse(localStorage.getItem('mangaverse_history') || '[]');
        state.readerWidth = localStorage.getItem('mangaverse_reader_width') || '800';
        setReaderWidth(state.readerWidth, false);
    } catch (e) {
        console.warn('LocalStorage load error:', e);
    }
}

function saveStoredData() {
    try {
        localStorage.setItem('mangaverse_read', JSON.stringify(Array.from(state.readChapters)));
        localStorage.setItem('mangaverse_bookmarks', JSON.stringify(state.bookmarks));
        localStorage.setItem('mangaverse_history', JSON.stringify(state.history));
    } catch (e) {
        console.warn('LocalStorage save error:', e);
    }
}

// =========================================================
// POPULAR TAGS (แท็กยอดนิยม)
// =========================================================
function renderPopularTags() {
    const container = document.getElementById('popularTagsBar');
    if (!container) return;

    container.innerHTML = POPULAR_TAGS.map(t => {
        const isActive = state.currentTag === t.id;
        const cls = isActive
            ? 'px-3 py-1 bg-sky-500/25 border border-sky-400 text-sky-200 font-bold rounded-lg text-xs transition flex items-center gap-1.5 shadow-sm whitespace-nowrap cursor-pointer'
            : 'px-3 py-1 bg-wt-card hover:bg-wt-hover border border-wt-border rounded-lg text-xs font-semibold text-gray-300 hover:text-white transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer';
        
        return `
            <button type="button" onclick="toggleTag('${t.id}')" class="${cls}">
                <span>${t.label}</span>
                ${isActive ? '<i class="fa-solid fa-xmark text-[10px] ml-0.5 text-sky-300 hover:text-white"></i>' : ''}
            </button>
        `;
    }).join('');
}

function toggleTag(tag) {
    if (state.currentTag === tag) {
        clearTag();
    } else {
        selectTag(tag);
    }
}

function selectTag(tag) {
    state.currentTag = tag;
    state.currentPage = 1;
    state.searchQuery = '';
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    
    // Unset viewMode active styling
    ['Latest', 'Featured', 'Random'].forEach(m => {
        const btn = document.getElementById(`viewBtn${m}`);
        if (btn) btn.className = 'view-mode-btn px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold text-gray-400 hover:text-white transition flex items-center gap-1.5';
    });
    
    const info = document.getElementById('filterInfoText');
    if (info) info.textContent = `กำลังกรองแท็ก: #${tag}`;

    renderPopularTags();
    fetchCatalog(1);
}

function clearTag() {
    state.currentTag = null;
    state.currentPage = 1;
    renderPopularTags();
    setViewMode('latest');
}

function selectTagFromModal(tag) {
    closeDetailModal();
    selectTag(tag);
}

// =========================================================
// SOURCE SWITCHING & VIEW MODES
// =========================================================
function setViewMode(mode) {
    state.viewMode = mode;
    state.currentPage = 1;
    state.currentTag = null;
    if (mode === 'random') {
        state.randomBatch = 1;
    }
    renderPopularTags();

    // Update Buttons UI
    const modes = ['Latest', 'Featured', 'Random'];
    modes.forEach(m => {
        const btn = document.getElementById(`viewBtn${m}`);
        if (!btn) return;
        if (m.toLowerCase() === mode) {
            btn.className = 'view-mode-btn active px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition flex items-center gap-1.5';
        } else {
            btn.className = 'view-mode-btn px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold text-gray-400 hover:text-white transition flex items-center gap-1.5';
        }
    });

    const info = document.getElementById('filterInfoText');
    if (info) {
        if (mode === 'featured') {
            info.textContent = 'กำลังแสดง: เรื่องเด่นยอดนิยม';
        } else if (mode === 'random') {
            info.textContent = 'กำลังแสดง: สุ่มมังงะ (กดซ้ำเพื่อสุ่มใหม่)';
        } else {
            info.textContent = 'กำลังแสดง: รายการอัปเดตล่าสุด';
        }
    }

    fetchCatalog(1);
}

function switchSource(source) {
    if (state.currentSource === source && !state.searchQuery) return;
    
    state.currentSource = source;
    state.currentPage = 1;
    state.searchQuery = '';
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    const clearBtn = document.getElementById('searchClearBtn');
    if (clearBtn) clearBtn.classList.add('hidden');

    // Update switcher pill UI
    const btnMiku = document.getElementById('sourceBtnMiku');
    const btnDth = document.getElementById('sourceBtnDth');
    const catalogTitle = document.getElementById('catalogTitle');
    const iconBadge = document.getElementById('sourceIconBadge');

    const sourceName = source === 'miku' ? 'Miku' : 'Manga-TH';
    const colorClass = source === 'miku' ? 'text-sky-400' : 'text-amber-400';

    if (source === 'miku') {
        btnMiku.className = 'source-btn-miku active px-2.5 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center gap-1.5 border border-transparent';
        btnDth.className = 'source-btn-dth px-2.5 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold text-gray-400 hover:text-white transition-all duration-200 flex items-center gap-1.5 border border-transparent';
        iconBadge.className = 'w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center text-sm font-bold';
        iconBadge.innerHTML = '<i class="fa-solid fa-cloud-moon"></i>';
    } else {
        btnDth.className = 'source-btn-dth active px-2.5 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center gap-1.5 border border-transparent';
        btnMiku.className = 'source-btn-miku px-2.5 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold text-gray-400 hover:text-white transition-all duration-200 flex items-center gap-1.5 border border-transparent';
        iconBadge.className = 'w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-sm font-bold';
        iconBadge.innerHTML = '<i class="fa-solid fa-bolt"></i>';
    }

    updateCatalogHeader();
    fetchCatalog(1);
}

function updateCatalogHeader() {
    const catalogTitle = document.getElementById('catalogTitle');
    const sourceName = state.currentSource === 'miku' ? 'Miku' : 'Manga-TH';
    const colorClass = state.currentSource === 'miku' ? 'text-sky-400' : 'text-amber-400';

    if (state.currentTag) {
        catalogTitle.innerHTML = `แท็กยอดนิยม: <span class="${colorClass}">#${escapeHtml(state.currentTag)}</span> (${sourceName})`;
    } else if (state.searchQuery) {
        catalogTitle.innerHTML = `ผลการค้นหา: <span class="${colorClass}">"${escapeHtml(state.searchQuery)}"</span> (${sourceName})`;
    } else if (state.viewMode === 'featured') {
        catalogTitle.innerHTML = `เรื่องเด่นยอดนิยม: <span class="${colorClass}">${sourceName}</span>`;
    } else if (state.viewMode === 'random') {
        catalogTitle.innerHTML = `สุ่มมังงะ: <span class="${colorClass}">${sourceName}</span>`;
    } else {
        catalogTitle.innerHTML = `มังงะอัปเดตล่าสุด: <span class="${colorClass}">${sourceName}</span>`;
    }
}

// Quick instant random reader
async function randomReadInstant() {
    try {
        const res = await fetch(`/api/${state.currentSource}/random?_t=${Date.now()}`);
        if (!res.ok) throw new Error('Random fetch failed');
        const data = await res.json();
        const items = data.items || [];
        if (items.length > 0) {
            const randomIndex = Math.floor(Math.random() * items.length);
            const picked = items[randomIndex];
            openMangaDetail(picked.id);
        }
    } catch (err) {
        console.error('Instant random failed:', err);
    }
}

// =========================================================
// CATALOG FETCHING & RENDERING
// =========================================================
async function fetchCatalog(page = 1) {
    state.currentPage = page;
    const grid = document.getElementById('mangaGrid');
    const skeleton = document.getElementById('loadingSkeleton');
    const emptyState = document.getElementById('emptyState');
    const pageBadge = document.getElementById('pageIndicatorBadge');
    const currPageDisplay = document.getElementById('currentPageDisplay');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const paginationBar = document.getElementById('paginationBar');

    grid.innerHTML = '';
    skeleton.classList.remove('hidden');
    emptyState.classList.add('hidden');
    pageBadge.textContent = state.viewMode === 'random' ? `สุ่มชุดที่ ${state.randomBatch || 1}` : `หน้า ${page}`;
    
    updateCatalogHeader();

    const timestamp = Date.now();
    let endpoint = '';
    if (state.currentTag) {
        endpoint = `/api/${state.currentSource}/tag/${encodeURIComponent(state.currentTag)}?page=${page}&_t=${timestamp}`;
    } else if (state.searchQuery) {
        endpoint = `/api/${state.currentSource}/search?q=${encodeURIComponent(state.searchQuery)}&page=${page}&_t=${timestamp}`;
    } else if (state.viewMode === 'featured') {
        endpoint = `/api/${state.currentSource}/featured?page=${page}&_t=${timestamp}`;
    } else if (state.viewMode === 'random') {
        endpoint = `/api/${state.currentSource}/random?batch=${state.randomBatch || 1}&_t=${timestamp}`;
    } else {
        endpoint = `/api/${state.currentSource}/latest?page=${page}&_t=${timestamp}`;
    }

    // Always keep paginationBar visible so user can paginate or reroll
    if (paginationBar) paginationBar.classList.remove('hidden');

    try {
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        skeleton.classList.add('hidden');
        const items = data.items || [];

        if (items.length === 0) {
            emptyState.classList.remove('hidden');
            if (nextPageBtn) {
                nextPageBtn.disabled = true;
                nextPageBtn.classList.add('opacity-40', 'cursor-not-allowed');
            }
            return;
        }

        renderMangaCards(items);

        // Update Pagination Controls
        if (state.viewMode === 'random') {
            // Random Mode: Prev is disabled, Next rolls a new batch
            if (prevBtn) {
                prevBtn.disabled = true;
                prevBtn.classList.add('opacity-40', 'cursor-not-allowed');
            }
            if (currPageDisplay) {
                currPageDisplay.innerHTML = `<i class="fa-solid fa-dice mr-1 text-purple-400"></i> สุ่มชุดที่ ${state.randomBatch || 1}`;
            }
            if (nextPageBtn) {
                nextPageBtn.disabled = false;
                nextPageBtn.classList.remove('opacity-40', 'cursor-not-allowed');
                nextPageBtn.innerHTML = `สุ่มชุดถัดไป <i class="fa-solid fa-rotate-right ml-1"></i>`;
            }
        } else {
            // Normal / Featured / Search Mode
            if (prevBtn) {
                prevBtn.disabled = page <= 1;
                if (page <= 1) {
                    prevBtn.classList.add('opacity-40', 'cursor-not-allowed');
                } else {
                    prevBtn.classList.remove('opacity-40', 'cursor-not-allowed');
                }
            }
            if (currPageDisplay) {
                currPageDisplay.textContent = `หน้า ${page}`;
            }
            if (nextPageBtn) {
                const hasNext = data.has_next !== false;
                nextPageBtn.disabled = !hasNext;
                nextPageBtn.innerHTML = `ถัดไป <i class="fa-solid fa-chevron-right ml-1"></i>`;
                if (!hasNext) {
                    nextPageBtn.classList.add('opacity-40', 'cursor-not-allowed');
                } else {
                    nextPageBtn.classList.remove('opacity-40', 'cursor-not-allowed');
                }
            }
        }

        // Auto-scroll to top of catalog when paginating
        if (page > 1 || (state.viewMode === 'random' && (state.randomBatch || 1) > 1)) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (err) {
        console.error('Fetch catalog failed:', err);
        skeleton.classList.add('hidden');
        grid.innerHTML = `
            <div class="col-span-full py-12 text-center text-red-400">
                <i class="fa-solid fa-triangle-exclamation text-2xl mb-2"></i>
                <p class="text-sm font-bold">ไม่สามารถดึงข้อมูลได้: ${err.message}</p>
                <button onclick="fetchCatalog(${page})" class="mt-3 px-4 py-1.5 bg-wt-card border border-wt-border rounded-xl text-xs text-white hover:bg-wt-hover transition">
                    ลองใหม่อีกครั้ง
                </button>
            </div>
        `;
    }
}

function renderMangaCards(items) {
    const grid = document.getElementById('mangaGrid');
    grid.innerHTML = items.map(item => {
        const isRead = state.readChapters.has(item.id);
        const sourceBadgeClass = item.source === 'miku' 
            ? 'bg-sky-500/90 text-white' 
            : 'bg-amber-500/90 text-black';
        const sourceLabel = item.source === 'miku' ? 'Miku' : 'TH';
        
        // Proxy image for hotlink and CORS protection
        const proxiedThumb = !item.thumbnail 
            ? 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><rect width="300" height="400" fill="%231a1b26"/><text x="50%" y="50%" fill="%23666" text-anchor="middle" font-family="sans-serif" font-size="16">ไม่มีรูปภาพ</text></svg>'
            : (item.source === 'miku' || !item.thumbnail.includes('hentaithai.net'))
                ? item.thumbnail
                : `/api/proxy-image?url=${encodeURIComponent(item.thumbnail)}&source=${item.source}`;

        const proxiedOverlay = item.thumbnail_overlay
            ? `/api/proxy-image?url=${encodeURIComponent(item.thumbnail_overlay)}&source=${item.source}`
            : null;

        return `
            <div onclick="openMangaDetail('${item.id}')" 
                class="manga-card bg-wt-card border border-wt-border hover:border-sky-500/50 rounded-xl overflow-hidden cursor-pointer flex flex-col group relative">
                
                <!-- Poster Image Container -->
                <div class="aspect-[3/4] w-full relative bg-gray-900 overflow-hidden">
                    <img src="${proxiedThumb}" 
                         alt="${escapeHtml(item.title)}" 
                         loading="lazy" 
                         decoding="async"
                         class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                         onerror="this.onerror=null; this.src='${item.thumbnail || ''}';">

                    ${proxiedOverlay ? `
                        <img src="${proxiedOverlay}" 
                             alt="" 
                             aria-hidden="true" 
                             class="absolute inset-0 w-full h-full object-cover pointer-events-none transition-transform duration-300 group-hover:scale-105"
                             onerror="this.style.display='none';">
                    ` : ''}

                    <!-- Badges -->
                    <span class="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold shadow-md ${sourceBadgeClass}">
                        ${sourceLabel}
                    </span>

                    ${isRead ? `
                        <span class="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/90 text-white shadow-md flex items-center gap-1">
                            <i class="fa-solid fa-check text-[9px]"></i> อ่านแล้ว
                        </span>
                    ` : ''}

                    <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2 pt-6">
                        <span class="text-[10px] font-medium text-gray-300 line-clamp-1">
                            <i class="fa-regular fa-clock mr-1 text-sky-400"></i> ${escapeHtml(item.updated_at || item.latest_chapter || 'ล่าสุด')}
                        </span>
                    </div>
                </div>

                <!-- Info Block -->
                <div class="p-2 sm:p-2.5 flex-grow flex flex-col justify-between">
                    <h3 class="text-xs sm:text-sm font-bold text-gray-100 group-hover:text-sky-400 transition-colors line-clamp-2 leading-tight">
                        ${escapeHtml(item.title)}
                    </h3>
                    ${item.subtitle ? `
                        <p class="text-[10px] text-gray-400 truncate mt-0.5 font-normal">
                            ${escapeHtml(item.subtitle)}
                        </p>
                    ` : ''}
                </div>

            </div>
        `;
    }).join('');
}

// =========================================================
// SEARCH FUNCTIONALITY
// =========================================================
function toggleSearchBar() {
    const dropdown = document.getElementById('searchDropdown');
    dropdown.classList.toggle('hidden');
    if (!dropdown.classList.contains('hidden')) {
        const input = document.getElementById('searchInput');
        input.focus();
    }
}

function handleSearchSubmit(event) {
    if (event) event.preventDefault();
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;

    state.searchQuery = query;
    state.currentPage = 1;
    
    const clearBtn = document.getElementById('searchClearBtn');
    if (clearBtn) clearBtn.classList.remove('hidden');

    const catalogTitle = document.getElementById('catalogTitle');
    catalogTitle.innerHTML = `ผลการค้นหา: <span class="text-sky-400">"${escapeHtml(query)}"</span>`;

    fetchCatalog(1);
}

function clearSearch() {
    const input = document.getElementById('searchInput');
    input.value = '';
    state.searchQuery = '';
    state.currentPage = 1;
    
    document.getElementById('searchClearBtn').classList.add('hidden');
    
    const sourceName = state.currentSource === 'miku' ? 'Miku' : 'Manga-TH';
    const colorClass = state.currentSource === 'miku' ? 'text-sky-400' : 'text-amber-400';
    document.getElementById('catalogTitle').innerHTML = `มังงะอัปเดตล่าสุด: <span class="${colorClass}">${sourceName}</span>`;
    
    fetchCatalog(1);
}

function resetToHome() {
    state.searchQuery = '';
    state.currentTag = null;
    state.currentPage = 1;
    const input = document.getElementById('searchInput');
    if (input) input.value = '';
    document.getElementById('searchClearBtn')?.classList.add('hidden');
    document.getElementById('searchDropdown')?.classList.add('hidden');
    renderPopularTags();
    exitReader();
    closeDetailModal();
    switchSource(state.currentSource);
}

function goToPage(page) {
    if (state.viewMode === 'random') {
        state.randomBatch = (state.randomBatch || 1) + 1;
        fetchCatalog(1);
        return;
    }
    if (page < 1) return;
    fetchCatalog(page);
}

function refreshCatalog() {
    fetchCatalog(state.currentPage);
}

// =========================================================
// MANGA DETAIL MODAL
// =========================================================
async function openMangaDetail(id) {
    const modal = document.getElementById('detailModal');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Reset modal state
    document.getElementById('modalTitle').textContent = 'กำลังโหลดข้อมูล...';
    document.getElementById('modalSubtitle').textContent = '';
    document.getElementById('modalGenres').innerHTML = '<span class="text-xs text-gray-500">กำลังโหลด...</span>';
    document.getElementById('modalChapterList').innerHTML = '<div class="py-4 text-center text-xs text-gray-400"><i class="fa-solid fa-circle-notch fa-spin mr-1"></i> โหลดรายการตอน...</div>';

    try {
        const res = await fetch(`/api/${state.currentSource}/detail/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        state.currentManga = data;
        state.chapters = data.chapters || [];

        // Poster image with proxy
        const proxiedCover = data.thumbnail 
            ? `/api/proxy-image?url=${encodeURIComponent(data.thumbnail)}&source=${data.source}`
            : '';
        document.getElementById('modalCover').src = proxiedCover;
        
        // Badge
        const badge = document.getElementById('modalSourceBadge');
        badge.textContent = data.source === 'miku' ? 'Miku' : 'Manga-TH';
        badge.className = data.source === 'miku' 
            ? 'absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500 text-white shadow'
            : 'absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-black shadow';

        document.getElementById('modalTitle').textContent = data.title;
        document.getElementById('modalSubtitle').textContent = data.subtitle || '';
        document.getElementById('modalChapterCount').textContent = state.chapters.length;

        // Genres
        const genresDiv = document.getElementById('modalGenres');
        if (data.genres && data.genres.length > 0) {
            genresDiv.innerHTML = data.genres.map(g => `
                <button type="button" onclick="selectTagFromModal('${escapeHtml(g)}')" 
                    class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-wt-dark hover:bg-sky-500/20 border border-wt-border hover:border-sky-500/50 text-gray-300 hover:text-sky-300 transition cursor-pointer flex items-center gap-1 shadow-sm">
                    <i class="fa-solid fa-tag text-[9px] text-sky-400"></i> ${escapeHtml(g)}
                </button>
            `).join('');
        } else {
            genresDiv.innerHTML = '<span class="text-[11px] text-gray-500">- ไม่มีข้อมูลแท็ก -</span>';
        }

        // Bookmark button state
        updateModalBookmarkBtn();

        // Render chapter list
        renderModalChapterList();

    } catch (err) {
        console.error('Failed to load manga detail:', err);
        document.getElementById('modalTitle').textContent = 'เกิดข้อผิดพลาดในการโหลดข้อมูล';
        document.getElementById('modalChapterList').innerHTML = `
            <div class="text-center py-4 text-red-400 text-xs">
                ${err.message}
            </div>
        `;
    }
}

function renderModalChapterList() {
    const listDiv = document.getElementById('modalChapterList');
    if (!state.chapters || state.chapters.length === 0) {
        listDiv.innerHTML = '<div class="text-xs text-gray-500 py-3 text-center">ไม่มีรายการตอน</div>';
        return;
    }

    listDiv.innerHTML = state.chapters.map((ch, idx) => {
        const isRead = state.readChapters.has(ch.id);
        return `
            <div onclick="openChapterByIndex(${idx})" 
                class="flex items-center justify-between p-2.5 rounded-xl bg-wt-dark hover:bg-wt-hover border border-wt-border cursor-pointer transition group">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="w-6 h-6 rounded-lg bg-wt-card text-[11px] font-bold text-gray-400 group-hover:text-sky-400 flex items-center justify-center flex-shrink-0">
                        ${idx + 1}
                    </span>
                    <span class="text-xs sm:text-sm font-semibold text-gray-200 group-hover:text-white truncate">
                        ${escapeHtml(ch.title || `ตอนที่ ${ch.chapter_num || idx + 1}`)}
                    </span>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                    ${isRead ? `
                        <span class="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                            <i class="fa-solid fa-check"></i> อ่านแล้ว
                        </span>
                    ` : ''}
                    <i class="fa-solid fa-chevron-right text-[10px] text-gray-500 group-hover:text-sky-400 transition"></i>
                </div>
            </div>
        `;
    }).join('');
}

function closeDetailModal() {
    const modal = document.getElementById('detailModal');
    modal.classList.add('hidden');
    document.body.style.overflow = '';
}

function startReadingFirstChapter() {
    if (state.chapters && state.chapters.length > 0) {
        openChapterByIndex(0);
    }
}

// =========================================================
// ZERO-SEAM CONTINUOUS READER ENGINE
// =========================================================
async function openChapterByIndex(index) {
    if (!state.chapters || !state.chapters[index]) return;
    
    state.currentChapterIndex = index;
    const chapter = state.chapters[index];
    state.currentChapter = chapter;

    closeDetailModal();
    const readerView = document.getElementById('readerView');
    readerView.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Update titles in top bar
    document.getElementById('readerMangaTitle').textContent = state.currentManga ? state.currentManga.title : 'มังงะ';
    document.getElementById('readerChapterTitle').textContent = chapter.title || `ตอนที่ ${index + 1}`;
    document.getElementById('readerPageCounter').textContent = 'กำลังโหลด...';

    // Clear previous images and show spinner
    const container = document.getElementById('readerImagesContainer');
    container.innerHTML = '';
    document.getElementById('readerLoadingSpinner').classList.remove('hidden');
    document.getElementById('readerFinishedBanner').classList.add('hidden');

    // Reset bottom bar visibility
    const bottomBar = document.getElementById('readerBottomBar');
    if (bottomBar) {
        bottomBar.classList.remove('reader-bar-hidden-permanent');
        bottomBar.classList.remove('bottom-bar-hidden');
    }

    // Update Bottom Nav Button States
    updateReaderNavButtons();

    // Scroll to top immediately
    readerView.scrollTo({ top: 0, behavior: 'instant' });

    // Mark as read in Set & Storage
    if (chapter.id) {
        state.readChapters.add(chapter.id);
        if (state.currentManga) {
            state.readChapters.add(state.currentManga.id);
            addToHistory(state.currentManga, chapter);
        }
        saveStoredData();
    }

    try {
        const res = await fetch(`/api/${state.currentSource}/chapter/${chapter.id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        document.getElementById('readerLoadingSpinner').classList.add('hidden');
        const images = data.images || [];

        if (images.length === 0) {
            container.innerHTML = `
                <div class="py-16 text-center text-gray-400">
                    <i class="fa-solid fa-triangle-exclamation text-3xl mb-2 text-amber-400"></i>
                    <p class="text-sm">ไม่พบรูปภาพในตอนนี้</p>
                </div>
            `;
            return;
        }

        renderReaderImages(images);

    } catch (err) {
        console.error('Failed to load chapter images:', err);
        document.getElementById('readerLoadingSpinner').classList.add('hidden');
        container.innerHTML = `
            <div class="py-16 text-center text-red-400">
                <i class="fa-solid fa-circle-exclamation text-3xl mb-2"></i>
                <p class="text-sm font-bold">โหลดภาพไม่สำเร็จ: ${err.message}</p>
                <button onclick="openChapterByIndex(${index})" class="mt-3 px-4 py-2 bg-wt-card border border-wt-border rounded-xl text-xs text-white">
                    ลองใหม่อีกครั้ง
                </button>
            </div>
        `;
    }
}

/**
 * Render images applying the 100% Zero-Seam 4-Tier formula
 */
function renderReaderImages(images) {
    const container = document.getElementById('readerImagesContainer');
    container.innerHTML = '';
    const totalPages = images.length;
    document.getElementById('readerPageCounter').textContent = `1 / ${totalPages}`;

    images.forEach((item, i) => {
        const baseSrc = typeof item === 'string' ? item : (item.src || item.url);
        const overlaySrc = (typeof item === 'object' && item.overlay) ? item.overlay : null;

        const wrapper = document.createElement('div');
        wrapper.className = 'manga-page-wrapper';
        wrapper.dataset.page = i + 1;

        const img = document.createElement('img');
        img.className = 'manga-page-img';
        img.alt = `หน้า ${i + 1}`;
        img.loading = (i < 3) ? 'eager' : 'lazy';
        img.decoding = 'async'; // Non-blocking GPU image decoding

        // Direct load for Miku or external CDN; route Doujin-TH via streaming proxy
        const proxiedSrc = (state.currentSource === 'miku' || !baseSrc.includes('hentaithai.net'))
            ? baseSrc
            : `/api/proxy-image?url=${encodeURIComponent(baseSrc)}&source=${state.currentSource}`;
        img.src = proxiedSrc;

        // Auto retry fallback
        img.onerror = () => {
            img.onerror = null;
            img.src = baseSrc; // Attempt direct load if proxy fails
        };

        wrapper.appendChild(img);

        // If Thai translation overlay exists (Doujin-TH dual layer)
        if (overlaySrc) {
            const overlayImg = document.createElement('img');
            overlayImg.className = 'hc-layer';
            overlayImg.alt = '';
            overlayImg.loading = (i < 3) ? 'eager' : 'lazy';
            overlayImg.decoding = 'async';
            overlayImg.src = `/api/proxy-image?url=${encodeURIComponent(overlaySrc)}&source=${state.currentSource}`;
            overlayImg.onerror = () => {
                overlayImg.style.display = 'none';
            };
            wrapper.appendChild(overlayImg);
        }

        container.appendChild(wrapper);
    });

    // Show finished banner at the end of the comic
    const finishedBanner = document.getElementById('readerFinishedBanner');
    finishedBanner.classList.remove('hidden');

    updateReaderNavButtons();
    setupIntersectionObserver(totalPages);
}

/**
 * Check if the finished banner is anywhere near or in the viewport.
 * If yes, forcefully and permanently hide the floating bottom bar to prevent overlapping.
 */
function checkBottomBarVisibility() {
    const bottomBar = document.getElementById('readerBottomBar');
    const banner = document.getElementById('readerFinishedBanner');
    if (!bottomBar) return false;
    
    if (banner && !banner.classList.contains('hidden')) {
        const rect = banner.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight;
        // If the banner is entering viewport or within 150px
        if (rect.top <= vh + 150 && rect.bottom >= -50) {
            bottomBar.classList.add('reader-bar-hidden-permanent');
            return true;
        }
    }
    bottomBar.classList.remove('reader-bar-hidden-permanent');
    return false;
}

function setupIntersectionObserver(totalPages) {
    const wrappers = document.querySelectorAll('.manga-page-wrapper, .manga-page-img');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const pageNum = entry.target.dataset.page;
                if (pageNum) {
                    document.getElementById('readerPageCounter').textContent = `${pageNum} / ${totalPages}`;
                }
            }
        });
    }, {
        root: document.getElementById('readerView'),
        rootMargin: '-40% 0px -40% 0px',
        threshold: 0
    });

    wrappers.forEach(w => observer.observe(w));

    // IntersectionObserver specifically for finishedBanner to hide bottom bar
    const banner = document.getElementById('readerFinishedBanner');
    if (banner) {
        const bannerObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const bottomBar = document.getElementById('readerBottomBar');
                if (!bottomBar) return;
                if (entry.isIntersecting) {
                    bottomBar.classList.add('reader-bar-hidden-permanent');
                } else {
                    checkBottomBarVisibility();
                }
            });
        }, {
            root: document.getElementById('readerView'),
            rootMargin: '0px 0px 150px 0px', // Trigger 150px before entering bottom of viewport
            threshold: 0
        });
        bannerObserver.observe(banner);
    }
}

function updateReaderNavButtons() {
    const hasPrev = state.currentChapterIndex > 0;
    const hasNext = state.currentChapterIndex < state.chapters.length - 1;

    // Floating bottom bar buttons
    const prevBtn = document.getElementById('readerPrevBtn');
    const nextBtn = document.getElementById('readerNextBtn');
    if (prevBtn) prevBtn.disabled = !hasPrev;
    if (nextBtn) nextBtn.disabled = !hasNext;

    // Finished Banner buttons
    const bannerPrev = document.getElementById('bannerPrevBtn');
    const bannerNext = document.getElementById('bannerNextBtn');
    if (bannerPrev) bannerPrev.disabled = !hasPrev;
    if (bannerNext) bannerNext.disabled = !hasNext;
}

function navigateChapter(direction) {
    if (direction === 'prev' && state.currentChapterIndex > 0) {
        openChapterByIndex(state.currentChapterIndex - 1);
    } else if (direction === 'next' && state.currentChapterIndex < state.chapters.length - 1) {
        openChapterByIndex(state.currentChapterIndex + 1);
    }
}

function exitReader() {
    const readerView = document.getElementById('readerView');
    readerView.classList.add('hidden');
    document.body.style.overflow = '';
    
    // Refresh card checkmarks in catalog
    if (state.currentManga) {
        fetchCatalog(state.currentPage);
    }
}

function scrollToTopReader() {
    document.getElementById('readerView').scrollTo({ top: 0, behavior: 'smooth' });
}

// =========================================================
// AUTO-HIDE HEADER ON SCROLL
// =========================================================
function setupScrollListeners() {
    const readerView = document.getElementById('readerView');
    const topBar = document.getElementById('readerTopBar');
    const bottomBar = document.getElementById('readerBottomBar');

    readerView.addEventListener('scroll', () => {
        const currentY = readerView.scrollTop;
        const delta = currentY - state.lastScrollY;

        // If banner is anywhere near view, floating bottom bar is suppressed completely!
        if (checkBottomBarVisibility()) {
            state.lastScrollY = currentY;
            return;
        }

        // Standard reading auto-hide on scroll
        if (delta > 25 && currentY > 80 && state.isBarsVisible) {
            topBar.classList.add('nav-hidden');
            bottomBar.classList.add('bottom-bar-hidden');
            state.isBarsVisible = false;
        } 
        else if (delta < -15 && !state.isBarsVisible) {
            topBar.classList.remove('nav-hidden');
            bottomBar.classList.remove('bottom-bar-hidden');
            state.isBarsVisible = true;
        }

        state.lastScrollY = currentY;
    }, { passive: true });

    // Tap/Click anywhere on reader toggles bars
    readerView.addEventListener('click', (e) => {
        // Only if clicking reader background or image directly
        if (e.target.closest('button') || e.target.closest('#readerTopBar') || e.target.closest('#readerBottomBar') || e.target.closest('#readerFinishedBanner')) {
            return;
        }

        // If banner is in view, do not display floating bottom bar!
        if (checkBottomBarVisibility()) {
            state.isBarsVisible = !state.isBarsVisible;
            if (state.isBarsVisible) {
                topBar.classList.remove('nav-hidden');
            } else {
                topBar.classList.add('nav-hidden');
            }
            return;
        }

        state.isBarsVisible = !state.isBarsVisible;
        if (state.isBarsVisible) {
            topBar.classList.remove('nav-hidden');
            bottomBar.classList.remove('bottom-bar-hidden');
        } else {
            topBar.classList.add('nav-hidden');
            bottomBar.classList.add('bottom-bar-hidden');
        }
    });
}

function setupKeyboardListeners() {
    window.addEventListener('keydown', (e) => {
        const readerView = document.getElementById('readerView');
        if (readerView.classList.contains('hidden')) return;

        if (e.key === 'Escape') {
            exitReader();
        } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
            navigateChapter('next');
        } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
            navigateChapter('prev');
        }
    });
}

// =========================================================
// CHAPTER SELECTION DRAWER
// =========================================================
function openChapterDrawer() {
    const drawer = document.getElementById('chapterDrawer');
    drawer.classList.remove('hidden');

    const listDiv = document.getElementById('drawerChapterList');
    if (!state.chapters || state.chapters.length === 0) {
        listDiv.innerHTML = '<div class="text-xs text-gray-500 py-3 text-center">ไม่มีข้อมูลตอน</div>';
        return;
    }

    listDiv.innerHTML = state.chapters.map((ch, idx) => {
        const isCurrent = idx === state.currentChapterIndex;
        const isRead = state.readChapters.has(ch.id);
        return `
            <div onclick="selectChapterFromDrawer(${idx})" 
                class="flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                    isCurrent 
                        ? 'bg-sky-500/20 border-sky-500/60 text-sky-400 font-bold' 
                        : 'bg-wt-dark hover:bg-wt-hover border-wt-border text-gray-300 font-semibold'
                }">
                <div class="flex items-center gap-2 truncate">
                    <span>${idx + 1}.</span>
                    <span class="truncate">${escapeHtml(ch.title || `ตอนที่ ${idx + 1}`)}</span>
                </div>
                ${isRead ? '<i class="fa-solid fa-check text-emerald-400 text-[10px]"></i>' : ''}
            </div>
        `;
    }).join('');
}

function selectChapterFromDrawer(idx) {
    closeChapterDrawer();
    openChapterByIndex(idx);
}

function closeChapterDrawer() {
    document.getElementById('chapterDrawer').classList.add('hidden');
}

// =========================================================
// READER SETTINGS MODAL
// =========================================================
function openReaderSettings() {
    document.getElementById('readerSettingsModal').classList.remove('hidden');
}

function closeReaderSettings() {
    document.getElementById('readerSettingsModal').classList.add('hidden');
}

function setReaderWidth(mode, save = true) {
    const container = document.getElementById('readerImagesContainer');
    container.className = `reader-width-${mode} w-full relative`;

    // Button states
    ['800', '1000', 'fit'].forEach(m => {
        const btn = document.getElementById(`widthBtn${m.charAt(0).toUpperCase() + m.slice(1)}`);
        if (!btn) return;
        if (m === mode) {
            btn.className = 'py-1.5 px-2 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/40 font-semibold text-center';
        } else {
            btn.className = 'py-1.5 px-2 rounded-lg bg-wt-dark text-gray-400 border border-wt-border font-semibold text-center';
        }
    });

    if (save) {
        state.readerWidth = mode;
        localStorage.setItem('mangaverse_reader_width', mode);
    }
}

function setReaderBg(color) {
    document.getElementById('readerView').style.backgroundColor = color;
}

// =========================================================
// BOOKMARKS & HISTORY
// =========================================================
function openBookmarksModal() {
    document.getElementById('bookmarksModal').classList.remove('hidden');
    switchBookmarkTab('bookmarks');
}

function closeBookmarksModal() {
    document.getElementById('bookmarksModal').classList.add('hidden');
}

function switchBookmarkTab(tab) {
    const bmBtn = document.getElementById('tabBookmarksBtn');
    const histBtn = document.getElementById('tabHistoryBtn');
    const list = document.getElementById('bookmarksList');
    const countText = document.getElementById('savedCountText');

    if (tab === 'bookmarks') {
        bmBtn.className = 'px-3 py-1 rounded-lg text-xs font-bold bg-sky-500 text-white';
        histBtn.className = 'px-3 py-1 rounded-lg text-xs font-bold text-gray-400 hover:text-white';
        
        countText.textContent = `บันทึกรายการโปรด ${state.bookmarks.length} เรื่อง`;
        renderSavedItems(state.bookmarks, 'bookmark');
    } else {
        histBtn.className = 'px-3 py-1 rounded-lg text-xs font-bold bg-sky-500 text-white';
        bmBtn.className = 'px-3 py-1 rounded-lg text-xs font-bold text-gray-400 hover:text-white';
        
        countText.textContent = `ประวัติการอ่าน ${state.history.length} เรื่อง`;
        renderSavedItems(state.history, 'history');
    }
}

function renderSavedItems(items, type) {
    const list = document.getElementById('bookmarksList');
    if (!items || items.length === 0) {
        list.innerHTML = `
            <div class="py-12 text-center text-gray-500 text-xs">
                <i class="fa-solid fa-inbox text-2xl mb-2 block"></i>
                ยังไม่มีข้อมูลที่บันทึกไว้
            </div>
        `;
        return;
    }

    list.innerHTML = items.map((item, idx) => `
        <div class="flex items-center justify-between p-2 rounded-xl bg-wt-dark border border-wt-border hover:border-gray-600 transition">
            <div onclick="openSavedManga('${item.id}', '${item.source}')" class="flex items-center gap-3 cursor-pointer min-w-0 flex-grow">
                <img src="/api/proxy-image?url=${encodeURIComponent(item.thumbnail || '')}&source=${item.source}" 
                     class="w-10 h-14 object-cover rounded-lg bg-gray-800 flex-shrink-0" onerror="this.src='';">
                <div class="min-w-0">
                    <h5 class="text-xs font-bold text-white truncate">${escapeHtml(item.title)}</h5>
                    <p class="text-[10px] text-gray-400 mt-0.5">
                        <span class="px-1.5 py-0.2 rounded ${item.source === 'miku' ? 'bg-sky-500/20 text-sky-400' : 'bg-amber-500/20 text-amber-400'} font-semibold mr-1">
                            ${item.source === 'miku' ? 'Miku' : 'TH'}
                        </span>
                        ${item.chapterTitle ? escapeHtml(item.chapterTitle) : ''}
                    </p>
                </div>
            </div>
            <button onclick="removeSavedItem('${item.id}', '${type}')" class="text-gray-500 hover:text-red-400 p-2 transition flex-shrink-0" title="ลบ">
                <i class="fa-regular fa-trash-can text-xs"></i>
            </button>
        </div>
    `).join('');
}

function openSavedManga(id, source) {
    closeBookmarksModal();
    if (state.currentSource !== source) {
        switchSource(source);
    }
    openMangaDetail(id);
}

function toggleBookmarkCurrentManga() {
    if (!state.currentManga) return;
    const manga = state.currentManga;
    const existsIdx = state.bookmarks.findIndex(b => b.id === manga.id);

    if (existsIdx >= 0) {
        state.bookmarks.splice(existsIdx, 1);
    } else {
        state.bookmarks.unshift({
            id: manga.id,
            title: manga.title,
            thumbnail: manga.thumbnail,
            source: manga.source,
            savedAt: Date.now()
        });
    }

    saveStoredData();
    updateModalBookmarkBtn();
    updateBookmarkBadge();
}

function updateModalBookmarkBtn() {
    const btn = document.getElementById('modalBookmarkBtn');
    if (!state.currentManga) return;
    const isBookmarked = state.bookmarks.some(b => b.id === state.currentManga.id);

    if (isBookmarked) {
        btn.innerHTML = '<i class="fa-solid fa-bookmark text-sky-400"></i> บันทึกแล้ว';
        btn.className = 'py-2.5 px-3.5 bg-sky-500/10 border border-sky-500/40 text-sky-400 rounded-xl text-sm transition flex items-center gap-1.5 font-bold';
    } else {
        btn.innerHTML = '<i class="fa-regular fa-bookmark"></i> บันทึก';
        btn.className = 'py-2.5 px-3.5 bg-wt-dark hover:bg-gray-800 border border-wt-border text-gray-300 hover:text-white rounded-xl text-sm transition flex items-center gap-1.5 font-semibold';
    }
}

function updateBookmarkBadge() {
    const badge = document.getElementById('bookmarkCountBadge');
    if (state.bookmarks.length > 0) {
        badge.textContent = state.bookmarks.length;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function addToHistory(manga, chapter) {
    const existingIdx = state.history.findIndex(h => h.id === manga.id);
    if (existingIdx >= 0) {
        state.history.splice(existingIdx, 1);
    }

    state.history.unshift({
        id: manga.id,
        title: manga.title,
        thumbnail: manga.thumbnail,
        source: manga.source,
        chapterTitle: chapter.title,
        chapterId: chapter.id,
        readAt: Date.now()
    });

    if (state.history.length > 50) {
        state.history.pop();
    }
    saveStoredData();
}

function removeSavedItem(id, type) {
    if (type === 'bookmark') {
        state.bookmarks = state.bookmarks.filter(b => b.id !== id);
        updateBookmarkBadge();
        switchBookmarkTab('bookmarks');
    } else {
        state.history = state.history.filter(h => h.id !== id);
        switchBookmarkTab('history');
    }
    saveStoredData();
}

function clearSavedData() {
    if (confirm('คุณต้องการล้างรายการที่บันทึกไว้ทั้งหมดหรือไม่?')) {
        state.bookmarks = [];
        state.history = [];
        saveStoredData();
        updateBookmarkBadge();
        closeBookmarksModal();
    }
}

// =========================================================
// UTILITY HELPERS
// =========================================================
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
