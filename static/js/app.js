/**
 * MangaVerse - Dual Manga Scraper & Zero-Seam Continuous Webtoon Engine
 */

const clientCache = new Map();

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
    setupScrollListeners();
    setupKeyboardListeners();
    handleRouteFromURL(true);
    window.addEventListener('popstate', () => handleRouteFromURL(false));
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
    updateSourceButtonsUI(source);
    updateCatalogHeader();
    updateURL({ source });
    fetchCatalog(1);
}

function updateSourceButtonsUI(source = state.currentSource) {
    const btnMiku = document.getElementById('sourceBtnMiku');
    const btnDth = document.getElementById('sourceBtnDth');
    const iconBadge = document.getElementById('sourceIconBadge');
    if (!btnMiku || !btnDth || !iconBadge) return;

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
}
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
// URL ROUTING & DEEP-LINKING SYNCHRONIZER
// =========================================================
function updateURL(params = {}) {
    const searchParams = new URLSearchParams();

    const src = params.source || state.currentSource;
    if (src && src !== 'miku') {
        searchParams.set('source', src);
    }

    if (params.manga) {
        searchParams.set('manga', params.manga);
        if (params.chapter) {
            searchParams.set('chapter', params.chapter);
        }
    } else {
        if (state.currentTag) {
            searchParams.set('tag', state.currentTag);
        } else if (state.searchQuery) {
            searchParams.set('q', state.searchQuery);
        } else if (state.viewMode && state.viewMode !== 'latest') {
            searchParams.set('view', state.viewMode);
        }
        if (state.currentPage && state.currentPage > 1) {
            searchParams.set('page', state.currentPage);
        }
    }

    const newQuery = searchParams.toString();
    const newPath = newQuery ? `?${newQuery}` : window.location.pathname;
    
    if (window.location.search !== (newQuery ? `?${newQuery}` : '')) {
        window.history.pushState({ ...params, source: src }, '', newPath);
    }
}

function handleCardClick(e, mangaId, source) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.which === 2 || e.button === 1) {
        return; // Native browser opens new tab
    }
    e.preventDefault();
    if (source && source !== state.currentSource) {
        state.currentSource = source;
        updateSourceButtonsUI(source);
    }
    openMangaDetail(mangaId);
}

function handleChapterClick(e, idx) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.which === 2 || e.button === 1) {
        return; // Native browser opens new tab
    }
    e.preventDefault();
    if (document.getElementById('chapterDrawer')) {
        closeChapterDrawer();
    }
    openChapterByIndex(idx);
}

async function handleRouteFromURL(isInitial = true) {
    const params = new URLSearchParams(window.location.search);
    const sourceParam = params.get('source');
    const mangaParam = params.get('manga');
    const chapterParam = params.get('chapter');
    const tagParam = params.get('tag');
    const qParam = params.get('q');
    const viewParam = params.get('view');
    const pageParam = parseInt(params.get('page') || '1', 10);

    if (sourceParam && (sourceParam === 'miku' || sourceParam === 'doujinth')) {
        state.currentSource = sourceParam;
        updateSourceButtonsUI(sourceParam);
    }

    if (tagParam) {
        state.currentTag = tagParam;
    } else if (qParam) {
        state.searchQuery = qParam;
    } else if (viewParam) {
        state.viewMode = viewParam;
    }

    // Direct link to reader chapter (from right click open in new tab or page reload)
    if (mangaParam && chapterParam) {
        fetchCatalog(pageParam);
        await openMangaDetail(mangaParam, false);
        const chIdx = state.chapters.findIndex(c => String(c.id) === String(chapterParam));
        const targetIdx = chIdx >= 0 ? chIdx : 0;
        await openChapterByIndex(targetIdx);
        return;
    }

    // Direct link to manga detail modal
    if (mangaParam) {
        fetchCatalog(pageParam);
        openMangaDetail(mangaParam);
        return;
    }

    // Handle back button when reader was open
    const readerView = document.getElementById('readerView');
    if (readerView && !readerView.classList.contains('hidden')) {
        readerView.classList.add('hidden');
        document.body.style.overflow = '';
    }
    const detailModal = document.getElementById('detailModal');
    if (detailModal && !detailModal.classList.contains('hidden')) {
        detailModal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    if (isInitial) {
        fetchCatalog(pageParam);
    }
}

async function reloadCurrentChapter() {
    if (state.currentChapterIndex !== undefined && state.chapters && state.chapters[state.currentChapterIndex]) {
        const iconTop = document.getElementById('readerReloadIconTop');
        const iconBottom = document.getElementById('readerReloadIconBottom');
        if (iconTop) iconTop.classList.add('fa-spin');
        if (iconBottom) iconBottom.classList.add('fa-spin');

        await openChapterByIndex(state.currentChapterIndex, true);

        setTimeout(() => {
            if (iconTop) iconTop.classList.remove('fa-spin');
            if (iconBottom) iconBottom.classList.remove('fa-spin');
        }, 500);
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

    let endpoint = '';
    let cacheKey = null;
    if (state.currentTag) {
        endpoint = `/api/${state.currentSource}/tag/${encodeURIComponent(state.currentTag)}?page=${page}`;
        cacheKey = `${state.currentSource}:tag:${state.currentTag}:${page}`;
    } else if (state.searchQuery) {
        endpoint = `/api/${state.currentSource}/search?q=${encodeURIComponent(state.searchQuery)}&page=${page}`;
        cacheKey = `${state.currentSource}:search:${state.searchQuery}:${page}`;
    } else if (state.viewMode === 'featured') {
        endpoint = `/api/${state.currentSource}/featured?page=${page}`;
        cacheKey = `${state.currentSource}:featured:${page}`;
    } else if (state.viewMode === 'random') {
        endpoint = `/api/${state.currentSource}/random?batch=${state.randomBatch || 1}&_t=${Date.now()}`;
        cacheKey = null;
    } else {
        endpoint = `/api/${state.currentSource}/latest?page=${page}`;
        cacheKey = `${state.currentSource}:latest:${page}`;
    }

    // Always keep paginationBar visible so user can paginate or reroll
    if (paginationBar) paginationBar.classList.remove('hidden');

    // Instant client-side cache return (0 ms UI response)
    if (cacheKey && clientCache.has(cacheKey)) {
        const cached = clientCache.get(cacheKey);
        if (Date.now() - cached.time < 180000) { // 3 minutes cache
            skeleton.classList.add('hidden');
            const items = cached.data.items || [];
            if (items.length > 0) {
                renderMangaCards(items);
                updatePaginationControls(cached.data);
                return;
            }
        }
    }

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

        // Save into instant client-side cache
        if (cacheKey && items.length > 0) {
            clientCache.set(cacheKey, { time: Date.now(), data });
        }

        // Update Pagination Controls
        updatePaginationControls(data, page);

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

function updatePaginationControls(data, page = state.currentPage) {
    const currPageDisplay = document.getElementById('currentPageDisplay');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');

    if (state.viewMode === 'random') {
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
}

function getImageUrl(url, source) {
    if (!url) {
        return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><rect width="300" height="400" fill="%231a1b26"/><text x="50%" y="50%" fill="%23666" text-anchor="middle" font-family="sans-serif" font-size="16">ไม่มีรูปภาพ</text></svg>';
    }
    // Miku CDN images are served over global Cloudflare and load directly & fast
    if (source === 'miku' && !url.includes('hentaithai.net')) {
        return url;
    }
    // Doujin-TH images (hosted on hentaithai.net) are blocked by Thai ISPs and Brave Shields;
    // route through our Rust streaming proxy to guarantee 100% display without blocking!
    return `/api/proxy-image?url=${encodeURIComponent(url)}&source=${source || 'doujinth'}`;
}

function renderMangaCards(items) {
    const grid = document.getElementById('mangaGrid');
    grid.innerHTML = items.map(item => {
        const isRead = state.readChapters.has(item.id);
        const sourceBadgeClass = item.source === 'miku' 
            ? 'bg-sky-500/90 text-white' 
            : 'bg-amber-500/90 text-black';
        const sourceLabel = item.source === 'miku' ? 'Miku' : 'TH';
        
        const directThumb = getImageUrl(item.thumbnail, item.source);
        const directOverlay = item.thumbnail_overlay ? getImageUrl(item.thumbnail_overlay, item.source) : null;

        return `
            <a href="/?source=${encodeURIComponent(item.source)}&manga=${encodeURIComponent(item.id)}" 
                onclick="handleCardClick(event, '${escapeHtml(item.id)}', '${escapeHtml(item.source)}')" 
                class="manga-card block bg-wt-card border border-wt-border hover:border-sky-500/50 rounded-xl overflow-hidden cursor-pointer flex flex-col group relative no-underline text-inherit">
                
                <!-- Poster Image Container -->
                <div class="aspect-[3/4] w-full relative bg-gray-900 overflow-hidden">
                    <img src="${directThumb}" 
                         alt="${escapeHtml(item.title)}" 
                         referrerpolicy="no-referrer"
                         loading="lazy" 
                         decoding="async"
                         class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                         onerror="if(!this.dataset.retried && '${item.thumbnail || ''}'){ this.dataset.retried='1'; this.src='/api/proxy-image?url=' + encodeURIComponent('${item.thumbnail}') + '&source=${item.source}'; }">

                    ${directOverlay ? `
                        <img src="${directOverlay}" 
                             alt="" 
                             aria-hidden="true" 
                             referrerpolicy="no-referrer"
                             class="absolute inset-0 w-full h-full object-cover pointer-events-none transition-transform duration-300 group-hover:scale-105"
                             onerror="if(!this.dataset.retried){ this.dataset.retried='1'; this.src='/api/proxy-image?url=' + encodeURIComponent('${item.thumbnail_overlay}') + '&source=${item.source}'; } else { this.style.display='none'; }">
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

            </a>
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
async function openMangaDetail(id, showModal = true) {
    const modal = document.getElementById('detailModal');
    if (showModal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        updateURL({ source: state.currentSource, manga: id });
    }

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

        // Poster image
        const coverImg = document.getElementById('modalCover');
        coverImg.referrerPolicy = 'no-referrer';
        coverImg.src = getImageUrl(data.thumbnail, data.source);
        coverImg.onerror = () => {
            if (!coverImg.dataset.retried && data.thumbnail) {
                coverImg.dataset.retried = '1';
                coverImg.src = `/api/proxy-image?url=${encodeURIComponent(data.thumbnail)}&source=${data.source}`;
            }
        };
        
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

    const mangaId = state.currentManga ? state.currentManga.id : '';

    listDiv.innerHTML = state.chapters.map((ch, idx) => {
        const isRead = state.readChapters.has(ch.id);
        return `
            <a href="/?source=${encodeURIComponent(state.currentSource)}&manga=${encodeURIComponent(mangaId)}&chapter=${encodeURIComponent(ch.id)}" 
                onclick="handleChapterClick(event, ${idx})" 
                class="flex items-center justify-between p-2.5 rounded-xl bg-wt-dark hover:bg-wt-hover border border-wt-border cursor-pointer transition group no-underline text-inherit block">
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
            </a>
        `;
    }).join('');
}

function closeDetailModal() {
    const modal = document.getElementById('detailModal');
    modal.classList.add('hidden');
    document.body.style.overflow = '';
    const readerView = document.getElementById('readerView');
    if (!readerView || readerView.classList.contains('hidden')) {
        updateURL({});
    }
}

function startReadingFirstChapter() {
    if (state.chapters && state.chapters.length > 0) {
        openChapterByIndex(0);
    }
}

// =========================================================
// ZERO-SEAM CONTINUOUS READER ENGINE
// =========================================================
async function openChapterByIndex(index, forceReload = false) {
    if (!state.chapters || !state.chapters[index]) return;
    
    state.currentChapterIndex = index;
    const chapter = state.chapters[index];
    state.currentChapter = chapter;

    closeDetailModal();
    const readerView = document.getElementById('readerView');
    readerView.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Synchronize current reading state into URL so F5/Reload stays in the reader!
    const mangaId = state.currentManga ? state.currentManga.id : '';
    updateURL({ source: state.currentSource, manga: mangaId, chapter: chapter.id });

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
        const url = `/api/${state.currentSource}/chapter/${chapter.id}${forceReload ? `?_t=${Date.now()}` : ''}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        document.getElementById('readerLoadingSpinner').classList.add('hidden');
        const images = data.images || [];

        if (images.length === 0) {
            container.innerHTML = `
                <div class="py-16 text-center text-gray-400">
                    <i class="fa-solid fa-triangle-exclamation text-3xl mb-2 text-amber-400"></i>
                    <p class="text-sm">ไม่พบรูปภาพในตอนนี้</p>
                    <button onclick="reloadCurrentChapter()" class="mt-4 px-4 py-2 bg-wt-card hover:bg-wt-hover border border-wt-border rounded-xl text-xs text-white">
                        <i class="fa-solid fa-rotate-right mr-1"></i> ลองโหลดใหม่อีกครั้ง
                    </button>
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
                <button onclick="reloadCurrentChapter()" class="mt-4 px-4 py-2 bg-wt-card hover:bg-wt-hover border border-wt-border rounded-xl text-xs text-white">
                    <i class="fa-solid fa-rotate-right mr-1"></i> ลองโหลดใหม่อีกครั้ง
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

        const isDirect = (state.currentSource === 'miku' && !baseSrc.includes('hentaithai.net'));
        const initialSrc = isDirect ? baseSrc : `/api/proxy-image?url=${encodeURIComponent(baseSrc)}&source=${state.currentSource}`;

        const img = document.createElement('img');
        img.className = 'manga-page-img';
        img.alt = `หน้า ${i + 1}`;
        img.loading = (i < 3) ? 'eager' : 'lazy';
        img.decoding = 'async'; // Non-blocking GPU image decoding
        img.referrerPolicy = 'no-referrer';
        img.src = initialSrc;

        // Auto fallback to proxy if direct CDN ever fails
        img.onerror = () => {
            if (!img.dataset.retried) {
                img.dataset.retried = '1';
                img.src = isDirect 
                    ? `/api/proxy-image?url=${encodeURIComponent(baseSrc)}&source=${state.currentSource}`
                    : baseSrc;
            }
        };

        wrapper.appendChild(img);

        // If Thai translation overlay exists (Doujin-TH dual layer)
        if (overlaySrc) {
            const isDirectOverlay = (state.currentSource === 'miku' && !overlaySrc.includes('hentaithai.net'));
            const initialOverlay = isDirectOverlay ? overlaySrc : `/api/proxy-image?url=${encodeURIComponent(overlaySrc)}&source=${state.currentSource}`;

            const overlayImg = document.createElement('img');
            overlayImg.className = 'hc-layer';
            overlayImg.alt = '';
            overlayImg.referrerPolicy = 'no-referrer';
            overlayImg.loading = (i < 3) ? 'eager' : 'lazy';
            overlayImg.decoding = 'async';
            overlayImg.src = initialOverlay;
            overlayImg.onerror = () => {
                if (!overlayImg.dataset.retried) {
                    overlayImg.dataset.retried = '1';
                    overlayImg.src = `/api/proxy-image?url=${encodeURIComponent(overlaySrc)}&source=${state.currentSource}`;
                } else {
                    overlayImg.style.display = 'none';
                }
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
    
    // Clear URL parameters when exiting reader mode
    updateURL({});

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
function handleDrawerChapterClick(e, idx) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.which === 2) {
        return; // Allow browser native open in new tab
    }
    e.preventDefault();
    selectChapterFromDrawer(idx);
}

function openChapterDrawer() {
    const drawer = document.getElementById('chapterDrawer');
    drawer.classList.remove('hidden');

    const listDiv = document.getElementById('drawerChapterList');
    if (!state.chapters || state.chapters.length === 0) {
        listDiv.innerHTML = '<div class="text-xs text-gray-500 py-3 text-center">ไม่มีข้อมูลตอน</div>';
        return;
    }

    const mangaId = state.currentManga ? state.currentManga.id : '';
    listDiv.innerHTML = state.chapters.map((ch, idx) => {
        const isCurrent = idx === state.currentChapterIndex;
        const isRead = state.readChapters.has(ch.id);
        return `
            <a href="/?source=${encodeURIComponent(state.currentSource)}&manga=${encodeURIComponent(mangaId)}&chapter=${encodeURIComponent(ch.id)}" 
                onclick="handleDrawerChapterClick(event, ${idx})" 
                class="flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition no-underline text-inherit block ${
                    isCurrent 
                        ? 'bg-sky-500/20 border-sky-500/60 text-sky-400 font-bold' 
                        : 'bg-wt-dark hover:bg-wt-hover border-wt-border text-gray-300 font-semibold'
                }">
                <div class="flex items-center gap-2 truncate">
                    <span>${idx + 1}.</span>
                    <span class="truncate">${escapeHtml(ch.title || `ตอนที่ ${idx + 1}`)}</span>
                </div>
                ${isRead ? '<i class="fa-solid fa-check text-emerald-400 text-[10px]"></i>' : ''}
            </a>
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

function handleSavedMangaClick(e, id, source) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.which === 2) {
        return; // Allow browser native open in new tab
    }
    e.preventDefault();
    openSavedManga(id, source);
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
            <a href="/?source=${encodeURIComponent(item.source)}&manga=${encodeURIComponent(item.id)}" 
               onclick="handleSavedMangaClick(event, '${escapeHtml(item.id)}', '${escapeHtml(item.source)}')" 
               class="flex items-center gap-3 cursor-pointer min-w-0 flex-grow no-underline text-inherit">
                <img src="${getImageUrl(item.thumbnail, item.source)}" 
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
            </a>
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
