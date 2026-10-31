// ===================================================================
// NEXO | MÓDULO NÚCLEO (CORE): SISTEMA, GASTOS, PRECIOS & PROVEEDORES
// ===================================================================

const STORAGE_KEY = 'nexo_gestor_cloud_v1';
const DEFAULT_APPSCRIPT_URL = ''; 

let donutChartInstance = null;
let currentEditingId = null;
let tempProdImageBase64 = '';
let isSyncing = false;

const defaultState = {
    bizConfig: { name: 'Mi Distribuidora / Comercio', contact: 'Presidencia Roque Sáenz Peña, Chaco' },
    cloudUrl: '',
    profitMode: 'margin',
    categories: ['Bebidas', 'Comestibles-Arroces', 'Comestible-Fideos', 'Aceites', 'Almacén', 'Repuestos'],
    suppliers: ['Directo de Fábrica', 'Distribuidor Mayorista', 'Diarco / Central'],
    clients: [
        { id: 1, name: 'Autoservicio El Sol', addr: 'Presidencia Roque Sáenz Peña', phone: '3644123456' }
    ],
    sellers: [
        { id: 1, name: 'Mostrador', phone: '' }
    ],
    expenses: [
        { id: 1, name: 'Secheep', category: 'servicios', amount: 190000 },
        { id: 2, name: 'Personal Flow', category: 'servicios', amount: 75000 },
        { id: 3, name: 'Cuota alimentaria', category: 'personal', amount: 400000 },
        { id: 4, name: 'Cuota colegio', category: 'personal', amount: 400000 }
    ],
    catalog: [
        { id: 101, name: 'Cerveza Bajo cero lata 710cc', category: 'Bebidas', supplier: 'Directo de Fábrica', grams: 'Plancha x 16 unid', image: '', cost: 2100, pack: 100, fixedPct: 10, sellerPct: 3, profitPct: 20, payFee: 0, iibb: 3.5, iva: 21, profitMode: 'margin', mixUnits: 1253, selectedForCatalog: true },
        { id: 102, name: 'Arroz Itajai 1kg', category: 'Comestibles-Arroces', supplier: 'Distribuidor Mayorista', grams: 'Bulto x 10 unid', image: '', cost: 750, pack: 30, fixedPct: 10, sellerPct: 3, profitPct: 20, payFee: 0, iibb: 3.5, iva: 21, profitMode: 'margin', mixUnits: 1200, selectedForCatalog: true }
    ],
    sales: []
};

let state = loadState();

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return JSON.parse(JSON.stringify(defaultState));
        return sanitizeState(JSON.parse(raw));
    } catch (e) {
        return JSON.parse(JSON.stringify(defaultState));
    }
}

function sanitizeState(data) {
    if (!data || typeof data !== 'object') return JSON.parse(JSON.stringify(defaultState));
    return {
        ...defaultState,
        ...data,
        bizConfig: data.bizConfig || defaultState.bizConfig,
        cloudUrl: (typeof data.cloudUrl === 'string') ? data.cloudUrl : '',
        categories: Array.isArray(data.categories) && data.categories.length > 0 ? data.categories : defaultState.categories,
        suppliers: Array.isArray(data.suppliers) && data.suppliers.length > 0 ? data.suppliers : defaultState.suppliers,
        clients: Array.isArray(data.clients) ? data.clients : defaultState.clients,
        sellers: Array.isArray(data.sellers) && data.sellers.length > 0 ? data.sellers : [{ id: 1, name: 'Mostrador', phone: '' }],
        expenses: Array.isArray(data.expenses) ? data.expenses : defaultState.expenses,
        catalog: Array.isArray(data.catalog) ? data.catalog : defaultState.catalog,
        sales: Array.isArray(data.sales) ? data.sales : []
    };
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        syncToCloud(); // Subida automática en segundo plano
        refreshAllViews();
    } catch (err) {
        console.error("Error al guardar estado:", err);
    }
}

// --- NAVEGACIÓN TOTALMENTE CONTROLADA ---
function switchTab(tabId) {
    try {
        ['tab1', 'tab2', 'tab3', 'tab4', 'tab5', 'tab6', 'tab7'].forEach(id => {
            const el = document.getElementById(id);
            const btn = document.getElementById('btn-' + id);
            if (el) el.classList.add('hidden');
            if (btn) btn.classList.remove('active', 'active-purple', 'active-emerald');
        });
        
        const activeEl = document.getElementById(tabId);
        const activeBtn = document.getElementById('btn-' + tabId);
        if (activeEl) activeEl.classList.remove('hidden');
        
        if (activeBtn) {
            if (tabId === 'tab4') {
                activeBtn.classList.add('active-purple');
            } else if (tabId === 'tab7') {
                activeBtn.classList.add('active-emerald');
            } else {
                activeBtn.classList.add('active');
            }
        }
        
        if (tabId === 'tab7' && typeof calculateDailyClosing === 'function') {
            calculateDailyClosing();
        }
        
        refreshAllViews();
    } catch (e) {
        console.error("Error al cambiar pestaña:", e);
    }
}

// --- REFRESCADO GLOBAL DE VISTAS ---
function refreshAllViews() {
    renderExpensesTab();
    if (typeof renderCatalog === 'function') renderCatalog();
    if (typeof renderMixTab === 'function') renderMixTab();
    if (typeof renderSalesHistory === 'function') renderSalesHistory();
    if (typeof renderSellersTab === 'function') renderSellersTab();
    if (typeof updateCartPreviews === 'function') updateCartPreviews();
    updateCloudStatusUI(Boolean(state.cloudUrl));
}

// --- SINCRONIZACIÓN AUTOMÁTICA EN SEGUNDO PLANO ---
function syncToCloud() {
    if (!state.cloudUrl || !state.cloudUrl.startsWith('https://script.google.com')) return;
    updateCloudStatusUI('syncing');
    fetch(state.cloudUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(state)
    }).then(() => {
        updateCloudStatusUI(true);
    }).catch(() => {
        updateCloudStatusUI(false);
    });
}

function syncFromCloudSilent() {
    if (!state.cloudUrl || !state.cloudUrl.startsWith('https://script.google.com') || isSyncing) return;
    isSyncing = true;
    updateCloudStatusUI('syncing');

    fetch(state.cloudUrl + '?t=' + Date.now(), { cache: 'no-store' })
        .then(r => r.json())
        .then(data => {
            isSyncing = false;
            if (data && typeof data === 'object' && (data.catalog || data.sales || data.expenses)) {
                state = sanitizeState(data);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
                refreshAllViews();
                updateCloudStatusUI(true);
            } else {
                updateCloudStatusUI(true);
            }
        })
        .catch(err => {
            isSyncing = false;
            console.warn("Fallo descarga silenciosa:", err);
            updateCloudStatusUI(false);
        });
}

function uploadAllToCloud() {
    if (!state.cloudUrl || !state.cloudUrl.startsWith('https://script.google.com')) {
        showToast('Configurá la URL de Google Sheets primero');
        return;
    }
    showToast('Subiendo datos a Google Sheets...');
    updateCloudStatusUI('syncing');
    fetch(state.cloudUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(state)
    }).then(() => {
        showToast('¡Sistema guardado en Google Drive!');
        updateCloudStatusUI(true);
    }).catch(() => {
        showToast('Error al subir a Google Sheets');
        updateCloudStatusUI(false);
    });
}

function syncFromCloudNow() {
    if (!state.cloudUrl || !state.cloudUrl.startsWith('https://script.google.com')) {
        showToast('Primero guardá la URL válida de Google Sheets');
        return;
    }
    showToast('Descargando datos de la nube...');
    updateCloudStatusUI('syncing');
    fetch(state.cloudUrl + '?t=' + Date.now(), { cache: 'no-store' })
        .then(r => r.json())
        .then(data => {
            if (data && typeof data === 'object') {
                state = sanitizeState(data);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
                refreshAllViews();
                showToast('¡Datos sincronizados desde Google Sheets!');
                closeCloudModal();
                updateCloudStatusUI(true);
            }
        })
        .catch(() => {
            showToast('Error al conectar con Google Sheets');
            updateCloudStatusUI(false);
        });
}

function openCloudModal() {
    const el = document.getElementById('cloudUrlInput');
    if (el) el.value = state.cloudUrl || '';
    const modal = document.getElementById('cloudModal');
    if (modal) {
        modal.classList.add('open');
        // Botón inteligente para mandarse el link al celular por WhatsApp
        let mobileBox = document.getElementById('btnMobileSyncBox');
        if (!mobileBox) {
            const container = modal.querySelector('.space-y-1');
            if (container) {
                mobileBox = document.createElement('div');
                mobileBox.id = 'btnMobileSyncBox';
                mobileBox.className = 'pt-2.5';
                mobileBox.innerHTML = `
                    <button type="button" onclick="copyMobileSyncLink()" class="w-full py-2.5 px-3 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2 transition">
                        <i class="fa-solid fa-mobile-screen"></i> Copiar enlace para abrir en el celular
                    </button>
                    <p class="text-[10px] text-slate-400 mt-1 text-center">Te copia el link de Nexo con tu planilla vinculada. Pegalo en WhatsApp y al abrirlo en el celular queda conectado automáticamente.</p>
                `;
                container.appendChild(mobileBox);
            }
        }
    }
}

function closeCloudModal() {
    const modal = document.getElementById('cloudModal');
    if (modal) modal.classList.remove('open');
}

function saveCloudConfig() {
    const el = document.getElementById('cloudUrlInput');
    const inputVal = el ? el.value.trim() : '';
    state.cloudUrl = inputVal;
    saveState();
    closeCloudModal();
    
    if (state.cloudUrl) {
        showToast('Enlace de Google Sheets guardado');
        uploadAllToCloud();
    } else {
        showToast('Modo sin conexión a la nube');
        updateCloudStatusUI(false);
    }
}

function copyMobileSyncLink() {
    if (!state.cloudUrl) {
        showToast('Primero guardá la URL de tu planilla');
        return;
    }
    const fullUrl = `${window.location.origin}${window.location.pathname}?sync=${encodeURIComponent(state.cloudUrl)}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
        showToast('¡Enlace copiado! Pegalo en WhatsApp y abrilo en el celular');
    });
}

function checkUrlParamsForSync() {
    try {
        const params = new URLSearchParams(window.location.search);
        const syncUrl = params.get('sync') || params.get('cloud');
        if (syncUrl && syncUrl.startsWith('https://script.google.com')) {
            state.cloudUrl = decodeURIComponent(syncUrl);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            window.history.replaceState({}, document.title, window.location.pathname);
            showToast('¡Planilla vinculada con éxito en este dispositivo!');
            syncFromCloudSilent();
        }
    } catch (e) {
        console.error("Error al procesar parámetro de sincronización:", e);
    }
}

function updateCloudStatusUI(status) {
    const dot = document.getElementById('cloudStatusDot');
    const txt = document.getElementById('cloudStatusText');
    const icon = document.getElementById('cloudIcon');
    if (!dot || !txt || !icon) return;

    if (status === 'syncing') {
        dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-ping';
        txt.textContent = 'Sincronizando...';
        txt.className = 'font-semibold text-amber-300';
        icon.className = 'fa-solid fa-arrows-rotate fa-spin text-amber-400';
    } else if (state.cloudUrl && status === true) {
        dot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
        txt.textContent = 'En la Nube (Google)';
        txt.className = 'font-semibold text-emerald-400';
        icon.className = 'fa-solid fa-cloud text-emerald-400';
    } else if (state.cloudUrl) {
        dot.className = 'w-2 h-2 rounded-full bg-blue-400';
        txt.textContent = 'Google Sheets Vinculado';
        txt.className = 'font-semibold text-blue-300';
        icon.className = 'fa-solid fa-cloud text-blue-400';
    } else {
        dot.className = 'w-2 h-2 rounded-full bg-slate-500';
        txt.textContent = 'Conectar Google Sheets';
        txt.className = 'font-semibold text-slate-300';
        icon.className = 'fa-solid fa-cloud text-slate-400';
    }
}

// Sincronización automática de inicio y cambio de ventana
window.addEventListener('DOMContentLoaded', () => {
    checkUrlParamsForSync();
    updateCloudStatusUI(Boolean(state.cloudUrl));
    refreshAllViews();
    if (state.cloudUrl) {
        setTimeout(syncFromCloudSilent, 800);
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.cloudUrl) {
        syncFromCloudSilent();
    }
});

window.addEventListener('focus', () => {
    if (state.cloudUrl) {
        syncFromCloudSilent();
    }
});

// --- UTILIDADES ---
function fmtARS(val) {
    return '$ ' + (Number(val) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(val) {
    return Math.ceil(Number(val) || 0).toLocaleString('es-AR');
}

function showToast(msg) {
    const box = document.getElementById('toastBox');
    const msgEl = document.getElementById('toastMsg');
    if (!box || !msgEl) return;
    msgEl.textContent = msg;
    box.classList.remove('hidden');
    setTimeout(() => box.classList.add('hidden'), 2800);
}

function parseArgentineDate(dateString) {
    if (!dateString) return new Date(0);
    const parts = dateString.split('/');
    if (parts.length === 3) {
        return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    return new Date(dateString); 
}

// --- BACKUP & RESTAURACIÓN ---
function exportBackupJSON() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nexo_respaldo_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
}

function importBackupJSON(e) {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
        try {
            let text = ev.target.result;
            if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
            const parsedData = JSON.parse(text);
            state = sanitizeState(parsedData);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            refreshAllViews();
            syncToCloud();
            showToast('¡Copia restaurada exitosamente!');
        } catch(err) { 
            console.error("Error al restaurar JSON:", err);
            showToast('El archivo no tiene un formato válido.'); 
        }
        e.target.value = '';
    };
    r.readAsText(f);
}

// --- CÁLCULOS UNITARIOS ---
function computeProductMetrics(item) {
    const baseCost = (Number(item.cost) || 0) + (Number(item.pack) || 0);
    const fixedPct = Number(item.fixedPct) || 0;
    const sellerPct = Number(item.sellerPct) || 0;
    const profitPct = Number(item.profitPct) || 0;
    const payFee = Number(item.payFee) || 0;
    const iibb = Number(item.iibb) || 0;
    const iva = Number(item.iva) || 0;
    const mode = item.profitMode || 'margin';

    let netPriceNoIVA = 0;
    if (mode === 'margin') {
        const totalDeductions = fixedPct + sellerPct + profitPct + payFee + iibb;
        netPriceNoIVA = baseCost / Math.max(0.05, (100 - totalDeductions) / 100);
    } else {
        const profitAmt = baseCost * (profitPct / 100);
        const other = fixedPct + sellerPct + payFee + iibb;
        netPriceNoIVA = (baseCost + profitAmt) / Math.max(0.05, (100 - other) / 100);
    }

    const fixedAmt = netPriceNoIVA * (fixedPct / 100);
    const sellerAmt = netPriceNoIVA * (sellerPct / 100);
    const netProfitAmt = netPriceNoIVA - baseCost - fixedAmt - sellerAmt - (netPriceNoIVA * (payFee / 100)) - (netPriceNoIVA * (iibb / 100));
    const finalPVP = netPriceNoIVA * (1 + iva / 100);
    const roiPct = baseCost > 0 ? (netProfitAmt / baseCost) * 100 : 0;
    const beUnits = fixedAmt > 0 ? Math.ceil(getTotalFixedExpenses() / fixedAmt) : 0;

    return {
        baseCost, fixedAmt, sellerAmt, netProfitAmt, finalPVP, roiPct, beUnits, profitPct,
        multiplier: baseCost > 0 ? finalPVP / baseCost : 1,
        beMoney: beUnits * finalPVP
    };
}

function getTotalFixedExpenses() {
    return (state.expenses || []).reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
}

// --- PESTAÑA 1: GASTOS ---
function renderExpensesTab() {
    try {
        const total = getTotalFixedExpenses();
        const elHeader = document.getElementById('headerFixedTotal');
        if (elHeader) elHeader.textContent = fmtARS(total);
        const elMonthly = document.getElementById('t1-totalMonthly');
        if (elMonthly) elMonthly.textContent = fmtARS(total);
        const elDaily = document.getElementById('t1-dailyCost');
        if (elDaily) elDaily.textContent = fmtARS(total / 24);
        const elWeekly = document.getElementById('t1-weeklyCost');
        if (elWeekly) elWeekly.textContent = fmtARS(total / 4);
        const elBadge = document.getElementById('badge-tab1');
        if (elBadge) elBadge.textContent = state.expenses.length;

        const catMap = {
            servicios: { title: 'Servicios Públicos & Conectividad', icon: 'fa-bolt text-amber-400' },
            inmueble: { title: 'Inmueble & Depósito', icon: 'fa-building text-blue-400' },
            logistica: { title: 'Logística, Vehículos & Combustible', icon: 'fa-truck text-emerald-400' },
            personal: { title: 'Personal, Sueldos & Honorarios', icon: 'fa-users text-purple-400' },
            gestion: { title: 'Gestión, Impuestos Fijos & Otros', icon: 'fa-briefcase text-slate-400' }
        };

        const grouped = {};
        Object.keys(catMap).forEach(k => grouped[k] = []);
        state.expenses.forEach(e => {
            const cat = e.category || 'gestion';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(e);
        });

        const c = document.getElementById('expensesCategoryContainer');
        if (!c) return;
        c.innerHTML = Object.keys(catMap).map(k => {
            const list = grouped[k];
            const subtotal = list.reduce((s, x) => s + (Number(x.amount) || 0), 0);
            return `
                <div class="card-pro p-4 space-y-2 border-slate-800">
                    <div class="flex items-center justify-between border-b border-slate-800/80 pb-2">
                        <div class="flex items-center gap-2 text-xs font-bold text-white">
                            <i class="fa-solid ${catMap[k].icon}"></i>
                            <span>${catMap[k].title}</span>
                            <span class="text-[10px] text-slate-500">(${list.length})</span>
                        </div>
                        <span class="font-mono font-bold text-xs text-blue-400">${fmtARS(subtotal)}</span>
                    </div>
                    <div class="space-y-1">
                        ${list.length === 0 ? '<p class="text-[11px] text-slate-600 italic py-1">Sin gastos registrados.</p>' : list.map(e => `
                            <div class="flex items-center justify-between text-xs py-1">
                                <span class="text-slate-300">${e.name}</span>
                                <div class="flex items-center gap-3">
                                    <span class="font-mono text-slate-200 font-semibold">${fmtARS(e.amount)}</span>
                                    <button onclick="deleteExpense(${e.id})" class="text-slate-500 hover:text-rose-400"><i class="fa-solid fa-trash text-[11px]"></i></button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error("Error en renderExpensesTab:", e);
    }
}

function addExpense(e) {
    e.preventDefault();
    const name = document.getElementById('expName').value.trim();
    const category = document.getElementById('expCategory').value;
    const amount = parseFloat(document.getElementById('expAmount').value) || 0;
    if (name && amount > 0) {
        state.expenses.push({ id: Date.now(), name, category, amount });
        document.getElementById('expName').value = '';
        document.getElementById('expAmount').value = '';
        saveState();
    }
}

function deleteExpense(id) {
    state.expenses = state.expenses.filter(e => e.id !== id);
    saveState();
}

// --- PESTAÑA 2: CALCULADORA, CATEGORÍAS & PROVEEDORES ---
function populateCategoryDropdowns() {
    const selCalc = document.getElementById('calcProdCategory');
    const selFilter = document.getElementById('catalogCategoryFilter');
    if (selCalc) selCalc.innerHTML = state.categories.map(c => `<option value="${c}">${c}</option>`).join('');
    if (selFilter) selFilter.innerHTML = '<option value="all">📁 Todas las Categorías</option>' + state.categories.map(c => `<option value="${c}">${c}</option>`).join('');
}

function populateSupplierDropdowns() {
    const selCalcSup = document.getElementById('calcProdSupplier');
    const selFilterSup = document.getElementById('catalogSupplierFilter');
    if (selCalcSup) selCalcSup.innerHTML = state.suppliers.map(s => `<option value="${s}">${s}</option>`).join('');
    if (selFilterSup) selFilterSup.innerHTML = '<option value="all">🏭 Todos los Proveedores</option>' + state.suppliers.map(s => `<option value="${s}">${s}</option>`).join('');
}

function openNewCategoryModal() {
    const input = document.getElementById('newCatInput');
    if (input) input.value = '';
    const modal = document.getElementById('newCategoryModal');
    if (modal) modal.classList.add('open');
}

function closeNewCategoryModal() {
    const modal = document.getElementById('newCategoryModal');
    if (modal) modal.classList.remove('open');
}

function saveNewCategory() {
    const input = document.getElementById('newCatInput');
    const cat = input ? input.value.trim() : '';
    if (cat && !state.categories.includes(cat)) {
        state.categories.push(cat);
        saveState();
        populateCategoryDropdowns();
        const sel = document.getElementById('calcProdCategory');
        if (sel) sel.value = cat;
        showToast(`Categoría "${cat}" guardada`);
    }
    closeNewCategoryModal();
}

function openNewSupplierModal() {
    const input = document.getElementById('newSupInput');
    if (input) input.value = '';
    const modal = document.getElementById('newSupplierModal');
    if (modal) modal.classList.add('open');
}

function closeNewSupplierModal() {
    const modal = document.getElementById('newSupplierModal');
    if (modal) modal.classList.remove('open');
}

function saveNewSupplier() {
    const input = document.getElementById('newSupInput');
    const sup = input ? input.value.trim() : '';
    if (sup && !state.suppliers.includes(sup)) {
        state.suppliers.push(sup);
        saveState();
        populateSupplierDropdowns();
        const sel = document.getElementById('calcProdSupplier');
        if (sel) sel.value = sup;
        showToast(`Proveedor "${sup}" guardado`);
    }
    closeNewSupplierModal();
}

function handleProductPhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX = 120;
            let w = img.width, h = img.height;
            if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } }
            else { if (h > MAX) { w *= MAX / h; h = MAX; } }
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            tempProdImageBase64 = canvas.toDataURL('image/jpeg', 0.75);
            setPhotoPreview(tempProdImageBase64);
        };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
}

function setPhotoPreview(base64) {
    const imgEl = document.getElementById('calcPhotoImg');
    const ph = document.getElementById('calcPhotoPlaceholder');
    const btnRemove = document.getElementById('btnRemovePhoto');
    if (!imgEl || !ph) return;

    if (base64) {
        imgEl.src = base64;
        imgEl.classList.remove('hidden');
        ph.classList.add('hidden');
        if (btnRemove) btnRemove.classList.remove('hidden');
    } else {
        imgEl.src = '';
        imgEl.classList.add('hidden');
        ph.classList.remove('hidden');
        if (btnRemove) btnRemove.classList.add('hidden');
    }
}

function removeProductPhoto() {
    tempProdImageBase64 = '';
    setPhotoPreview('');
}

function runCalculator() {
    try {
        const fixedPctEl = document.getElementById('calcFixedPct');
        if (!fixedPctEl) return;
        const fixedPct = parseFloat(fixedPctEl.value) || 0;
        const sellerPct = parseFloat(document.getElementById('calcSellerPct').value) || 0;
        const profitPct = parseFloat(document.getElementById('calcProfitPct').value) || 0;

        document.getElementById('lblFixedPct').textContent = fixedPct.toFixed(1) + '%';
        document.getElementById('lblSellerPct').textContent = sellerPct.toFixed(1) + '%';
        document.getElementById('lblProfitPct').textContent = profitPct.toFixed(1) + '%';

        const item = {
            cost: document.getElementById('calcCost').value,
            pack: document.getElementById('calcPack').value,
            fixedPct, sellerPct, profitPct,
            payFee: document.getElementById('calcPayFee').value,
            iibb: document.getElementById('calcIIBB').value,
            iva: document.getElementById('calcIVA').value,
            profitMode: state.profitMode
        };

        const m = computeProductMetrics(item);
        document.getElementById('resFinalPVP').textContent = fmtARS(m.finalPVP);
        document.getElementById('resMultiplierBadge').textContent = 'x' + m.multiplier.toFixed(2);
        document.getElementById('resNetProfitAmt').textContent = fmtARS(m.netProfitAmt);
        document.getElementById('resROIPct').textContent = m.roiPct.toFixed(1) + '%';
        document.getElementById('resSellerAmt').textContent = fmtARS(m.sellerAmt);
        document.getElementById('resFixedAmt').textContent = fmtARS(m.fixedAmt);
        document.getElementById('resBEUnits').textContent = fmtInt(m.beUnits) + ' UN.';
        updateDonutChart(m);
    } catch (e) {
        console.error("Error en runCalculator:", e);
    }
}

function setProfitMode(m) {
    state.profitMode = m;
    const btnMargin = document.getElementById('btnModeMargin');
    const btnMarkup = document.getElementById('btnModeMarkup');
    if (btnMargin && btnMarkup) {
        btnMargin.className = m === 'margin' ? 'px-2 py-1 rounded font-semibold bg-emerald-500/20 text-emerald-400' : 'px-2 py-1 text-slate-400';
        btnMarkup.className = m === 'markup' ? 'px-2 py-1 rounded font-semibold bg-emerald-500/20 text-emerald-400' : 'px-2 py-1 text-slate-400';
    }
    runCalculator();
}

function updateDonutChart(m) {
    const chartCanvas = document.getElementById('priceDonutChart');
    if (!chartCanvas || typeof Chart === 'undefined') return;
    const vals = [m.baseCost, m.fixedAmt, m.sellerAmt, m.netProfitAmt];
    const ctx = chartCanvas.getContext('2d');
    if (donutChartInstance) {
        donutChartInstance.data.datasets[0].data = vals;
        donutChartInstance.update();
    } else {
        donutChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Costo', 'Fijos', 'Comisión', 'Ganancia'],
                datasets: [{ data: vals, backgroundColor: ['#64748b', '#3b82f6', '#a855f7', '#10b981'], borderWidth: 0 }]
            },
            options: { responsive: true, cutout: '70%', plugins: { legend: { display: false } } }
        });
    }
}

function saveProductToCatalog() {
    const p = {
        id: currentEditingId || Date.now(),
        name: document.getElementById('calcProdName').value.trim() || 'Producto sin nombre',
        category: document.getElementById('calcProdCategory').value,
        supplier: document.getElementById('calcProdSupplier').value || 'Sin Proveedor',
        grams: document.getElementById('calcProdGrams').value.trim(),
        image: tempProdImageBase64,
        cost: parseFloat(document.getElementById('calcCost').value) || 0,
        pack: parseFloat(document.getElementById('calcPack').value) || 0,
        fixedPct: parseFloat(document.getElementById('calcFixedPct').value) || 0,
        sellerPct: parseFloat(document.getElementById('calcSellerPct').value) || 0,
        profitPct: parseFloat(document.getElementById('calcProfitPct').value) || 0,
        payFee: parseFloat(document.getElementById('calcPayFee').value) || 0,
        iibb: parseFloat(document.getElementById('calcIIBB').value) || 0,
        iva: parseFloat(document.getElementById('calcIVA').value) || 0,
        profitMode: state.profitMode,
        mixUnits: 50,
        selectedForCatalog: true
    };

    if (currentEditingId) {
        const idx = state.catalog.findIndex(x => x.id === currentEditingId);
        if (idx !== -1) {
            if (!p.image) p.image = state.catalog[idx].image || '';
            state.catalog[idx] = p;
        }
        showToast('¡Producto actualizado con éxito!');
        cancelProductEdit();
    } else {
        state.catalog.push(p);
        showToast('¡Producto agregado al catálogo!');
    }

    tempProdImageBase64 = '';
    setPhotoPreview('');
    saveState();
    switchTab('tab3');
}

function editCatalogProduct(id) {
    const p = state.catalog.find(x => x.id === id);
    if (!p) return;

    currentEditingId = p.id;
    document.getElementById('calcProdName').value = p.name || '';
    document.getElementById('calcProdCategory').value = p.category || state.categories[0];
    document.getElementById('calcProdSupplier').value = p.supplier || state.suppliers[0];
    document.getElementById('calcProdGrams').value = p.grams || '';
    document.getElementById('calcCost').value = p.cost || 0;
    document.getElementById('calcPack').value = p.pack || 0;
    document.getElementById('calcFixedPct').value = p.fixedPct || 0;
    document.getElementById('calcSellerPct').value = p.sellerPct || 0;
    document.getElementById('calcProfitPct').value = p.profitPct || 0;
    document.getElementById('calcPayFee').value = p.payFee || 0;
    document.getElementById('calcIIBB').value = p.iibb || 0;
    document.getElementById('calcIVA').value = p.iva !== undefined ? p.iva : 0;

    tempProdImageBase64 = p.image || '';
    setPhotoPreview(tempProdImageBase64);

    const ind = document.getElementById('editModeIndicator');
    if (ind) ind.classList.remove('hidden');
    const btnText = document.getElementById('btnSaveProdText');
    if (btnText) btnText.textContent = 'ACTUALIZAR PRODUCTO';

    setProfitMode(p.profitMode || 'margin');
    switchTab('tab2');
}

function cancelProductEdit() {
    currentEditingId = null;
    const ind = document.getElementById('editModeIndicator');
    if (ind) ind.classList.add('hidden');
    const btnText = document.getElementById('btnSaveProdText');
    if (btnText) btnText.textContent = 'GUARDAR EN CATÁLOGO';
    tempProdImageBase64 = '';
    setPhotoPreview('');
}

function copyWhatsAppQuote() {
    const name = document.getElementById('calcProdName').value;
    const pvp = document.getElementById('resFinalPVP').textContent;
    const grams = document.getElementById('calcProdGrams').value;
    const msg = `*${state.bizConfig.name}*\n📦 *${name}* ${grams ? `(${grams})` : ''}\n💵 *Precio Final: ${pvp}*\n_Consultas y pedidos por este medio._`;
    navigator.clipboard.writeText(msg).then(() => showToast('¡Cotización copiada para WhatsApp!'));
}

// --- PESTAÑA 3: CATÁLOGO ---
function renderCatalog() {
    try {
        const badgeT3 = document.getElementById('badge-tab3');
        if (badgeT3) badgeT3.textContent = state.catalog.length;
        populateCategoryDropdowns();
        populateSupplierDropdowns();

        const vFilterEl = document.getElementById('catalogViewFilter');
        const cFilterEl = document.getElementById('catalogCategoryFilter');
        const sFilterEl = document.getElementById('catalogSupplierFilter');
        if (!vFilterEl || !cFilterEl) return;

        const vFilter = vFilterEl.value;
        const cFilter = cFilterEl.value;
        const sFilter = sFilterEl ? sFilterEl.value : 'all';

        let items = state.catalog.map(p => ({ ...p, m: computeProductMetrics(p) }));

        if (items.length > 0) {
            const byROI = [...items].sort((a,b) => b.m.roiPct - a.m.roiPct);
            document.getElementById('t3-bestROIProd').textContent = byROI[0].name;
            document.getElementById('t3-bestROIPct').textContent = byROI[0].m.roiPct.toFixed(1) + '% ROI';

            const byCash = [...items].sort((a,b) => b.m.netProfitAmt - a.m.netProfitAmt);
            document.getElementById('t3-bestCashProd').textContent = byCash[0].name;
            document.getElementById('t3-bestCashVal').textContent = fmtARS(byCash[0].m.netProfitAmt);

            const avgR = items.reduce((s, x) => s + x.m.roiPct, 0) / items.length;
            document.getElementById('t3-avgROI').textContent = avgR.toFixed(1) + '%';

            const avgF = items.reduce((s, x) => s + x.m.fixedAmt, 0) / items.length;
            document.getElementById('t3-avgFixedAmt').textContent = fmtARS(avgF);
        }

        if (vFilter === 'selected') items = items.filter(p => p.selectedForCatalog !== false);
        if (cFilter !== 'all') items = items.filter(p => p.category === cFilter);
        if (sFilter !== 'all') items = items.filter(p => (p.supplier || 'Sin Proveedor') === sFilter);

        const tb = document.getElementById('catalogTableBody');
        if (!tb) return;
        tb.innerHTML = items.map(p => {
            const isChecked = p.selectedForCatalog !== false;
            return `
                <tr class="hover:bg-slate-900/50 ${!isChecked ? 'opacity-40' : ''}">
                    <td class="text-center py-2 px-3">
                        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleCatalogSelection(${p.id}, this.checked)" class="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 cursor-pointer">
                    </td>
                    <td class="py-2 px-3">
                        <div class="flex items-center gap-2">
                            <div class="w-8 h-8 rounded bg-white border border-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0 p-0.5">
                                ${p.image ? `<img src="${p.image}" class="w-full h-full object-contain">` : '<i class="fa-solid fa-box text-slate-400 text-xs"></i>'}
                            </div>
                            <div>
                                <span class="font-bold text-white block text-xs">${p.name}</span>
                                <div class="flex items-center gap-1.5 mt-0.5">
                                    <span class="text-[9px] text-blue-400 font-semibold">${p.category || 'General'}</span>
                                    <span class="text-[9px] text-amber-400 bg-amber-500/10 px-1 py-0.2 rounded border border-amber-500/20 font-mono">🏭 ${p.supplier || 'Sin Proveedor'}</span>
                                </div>
                            </div>
                        </div>
                    </td>
                    <td class="text-right font-mono text-slate-400">${fmtARS(p.m.baseCost)}</td>
                    <td class="text-right font-mono font-bold text-white">${fmtARS(p.m.finalPVP)}</td>
                    <td class="text-right font-mono text-blue-400">${fmtARS(p.m.fixedAmt)}</td>
                    <td class="text-right">
                        <span class="font-mono text-purple-300 font-bold block">${fmtARS(p.m.sellerAmt)}</span>
                        <span class="text-[10px] text-purple-400/80 font-mono">(${Number(p.sellerPct || 0).toFixed(1)}%)</span>
                    </td>
                    <td class="text-right font-mono text-emerald-400 font-bold">${fmtARS(p.m.netProfitAmt)}</td>
                    <td class="text-center font-mono font-bold text-amber-300">${p.m.roiPct.toFixed(1)}%</td>
                    <td class="text-center">
                        <div class="flex items-center justify-center gap-2">
                            <button onclick="editCatalogProduct(${p.id})" class="text-blue-400 hover:text-blue-300"><i class="fa-solid fa-pen-to-square"></i></button>
                            <button onclick="deleteCatalogProduct(${p.id})" class="text-slate-500 hover:text-rose-400"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        console.error("Error en renderCatalog:", e);
    }
}

function toggleCatalogSelection(id, checked) {
    const p = state.catalog.find(x => x.id === id);
    if (p) { p.selectedForCatalog = checked; saveState(); }
}

function selectAllCatalogProducts(select) {
    state.catalog.forEach(p => p.selectedForCatalog = select);
    saveState();
}

function deleteCatalogProduct(id) {
    if (confirm('¿Eliminar este producto del catálogo?')) {
        state.catalog = state.catalog.filter(p => p.id !== id);
        saveState();
    }
}

// --- PESTAÑA 4: MIX & EQUILIBRIO ---
function renderMixTab() {
    try {
        const tb = document.getElementById('mixTableBody');
        if (!tb) return;
        let tRev=0, tFixed=0, tProf=0;

        tb.innerHTML = state.catalog.map(p => {
            const m = computeProductMetrics(p);
            const u = Number(p.mixUnits) || 0;
            tRev += u * m.finalPVP;
            tFixed += u * m.fixedAmt;
            tProf += u * m.netProfitAmt;

            return `
                <tr class="hover:bg-slate-900/50">
                    <td class="py-2 px-3 font-bold text-white">${p.name}</td>
                    <td class="text-right font-mono">${fmtARS(m.finalPVP)}</td>
                    <td class="text-center"><input type="number" value="${u}" onchange="updateMixUnit(${p.id}, this.value)" class="input-pro w-20 text-center font-bold"></td>
                    <td class="text-right font-mono text-amber-300 font-bold">${fmtARS(u * m.finalPVP)}</td>
                    <td class="text-right font-mono text-blue-400">${fmtARS(u * m.fixedAmt)}</td>
                    <td class="text-right font-mono text-emerald-400">${fmtARS(u * m.netProfitAmt)}</td>
                </tr>
            `;
        }).join('');

        const totalFixed = getTotalFixedExpenses();
        const elBE = document.getElementById('t4-beTotalMoney');
        if (elBE) elBE.textContent = fmtARS(tRev);
        const elCover = document.getElementById('t4-fixedToCover');
        if (elCover) elCover.textContent = fmtARS(totalFixed);
        const elColl = document.getElementById('t4-fixedCollected');
        if (elColl) elColl.textContent = fmtARS(tFixed);
        const elProf = document.getElementById('t4-companyNetProfit');
        if (elProf) elProf.textContent = fmtARS(tProf);
    } catch (e) {
        console.error("Error en renderMixTab:", e);
    }
}

function updateMixUnit(id, val) {
    const p = state.catalog.find(x => x.id === id);
    if (p) { p.mixUnits = parseInt(val) || 0; saveState(); }
}

function autoDistributeBreakEvenMix() {
    const f = getTotalFixedExpenses();
    if (!f || state.catalog.length === 0) return;
    const perP = f / state.catalog.length;
    state.catalog.forEach(p => {
        const m = computeProductMetrics(p);
        p.mixUnits = m.fixedAmt > 0 ? Math.ceil(perP / m.fixedAmt) : 0;
    });
    saveState();
}

// --- GENERACIÓN DE CATÁLOGO PDF AISLADO ---
function generateCatalogDocumentHTML() {
    const uniqueMap = new Map();
    state.catalog.forEach(p => {
        if (p.selectedForCatalog !== false && !uniqueMap.has(p.id)) {
            uniqueMap.set(p.id, { ...p, m: computeProductMetrics(p) });
        }
    });
    const prods = Array.from(uniqueMap.values());

    if (prods.length === 0) {
        return '<div style="font-family:sans-serif; text-align:center; padding:50px; color:#555;">No hay productos seleccionados para el catálogo comercial.</div>';
    }

    const today = new Date().toLocaleDateString('es-AR');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Catálogo Oficial - ${state.bizConfig.name}</title>
            <style>
                @page { size: A4 portrait; margin: 10mm 12mm; }
                * { box-sizing: border-box; }
                body { margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; background: #ffffff; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                .header-banner { border-bottom: 2.5px solid #111827; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
                .header-title { font-size: 20px; font-weight: 900; margin: 0; text-transform: uppercase; letter-spacing: -0.5px; color: #0b2545; }
                .header-sub { font-size: 11px; color: #4b5563; margin: 3px 0 0 0; }
                .header-badge { font-size: 10px; font-weight: 800; border: 1.5px solid #111827; padding: 2px 7px; text-transform: uppercase; border-radius: 4px; background: #f9fafb; }
                .grid-container { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%; }
                .product-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; background: #ffffff; display: flex; flex-direction: column; justify-content: space-between; height: 270px; break-inside: avoid; page-break-inside: avoid; }
                .img-container { height: 140px; background: #ffffff; border: 1px solid #f3f4f6; border-radius: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden; margin-bottom: 8px; }
                .img-container img { max-height: 100%; max-width: 100%; object-fit: contain; }
                .cat-tag { font-size: 9px; font-weight: 800; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.5px; }
                .prod-name { font-size: 12px; font-weight: 800; margin: 2px 0; line-height: 1.25; color: #111827; max-height: 30px; overflow: hidden; }
                .prod-grams { font-size: 10px; color: #6b7280; margin: 0; }
                .price-box { border-top: 1px solid #f3f4f6; padding-top: 8px; display: flex; justify-content: space-between; align-items: baseline; }
                .price-label { font-size: 10px; font-weight: 800; color: #374151; }
                .price-val { font-size: 16px; font-weight: 900; color: #047857; font-family: monospace; }
                .footer-note { border-top: 1px solid #e5e7eb; margin-top: 16px; padding-top: 8px; display: flex; justify-content: space-between; font-size: 9px; color: #6b7280; }
            </style>
        </head>
        <body>
            <div class="header-banner">
                <div>
                    <h1 class="header-title">${state.bizConfig.name}</h1>
                    <p class="header-sub">${state.bizConfig.contact || 'Presidencia Roque Sáenz Peña, Chaco'} • Catálogo Comercial</p>
                </div>
                <div style="text-align: right;">
                    <span class="header-badge">LISTA OFICIAL PVP</span>
                    <div style="font-size: 10px; color: #4b5563; margin-top: 4px;">Fecha: ${today}</div>
                </div>
            </div>

            <div class="grid-container">
                ${prods.map(p => `
                    <div class="product-card">
                        <div>
                            <div class="img-container">
                                ${p.image ? `<img src="${p.image}">` : '<span style="color:#9ca3af; font-size:11px; font-weight:600;">Sin Imagen</span>'}
                            </div>
                            <span class="cat-tag">${p.category || 'General'}</span>
                            <div class="prod-name">${p.name}</div>
                            <p class="prod-grams">${p.grams || ''}</p>
                        </div>
                        <div class="price-box">
                            <span class="price-label">PVP SUGERIDO:</span>
                            <span class="price-val">${fmtARS(p.m.finalPVP)}</span>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="footer-note">
                <span>Precios sugeridos sujetos a variaciones sin previo aviso.</span>
                <span>Potenciado por Nexo</span>
            </div>
        </body>
        </html>
    `;
}

function openCatalogPDFModal() {
    const box = document.getElementById('pdfModalPreviewBox');
    if (box) box.innerHTML = generateCatalogDocumentHTML();
    const modal = document.getElementById('catalogPDFModal');
    if (modal) modal.classList.add('open');
}

function closeCatalogPDFModal() {
    const modal = document.getElementById('catalogPDFModal');
    if (modal) modal.classList.remove('open');
}

function executeIsolatedCatalogPrint() {
    const frame = document.getElementById('printIsolatedFrame');
    if (!frame) return;
    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(generateCatalogDocumentHTML());
    doc.close();

    setTimeout(() => {
        frame.contentWindow.focus();
        frame.contentWindow.print();
    }, 350);
}

function exportCatalogCSV() {
    let csv = "ID,Producto,Categoria,Proveedor,Presentacion,Costo,PVP,Reserva_Fijos,Comision,Ganancia_Limpia,ROI\n";
    state.catalog.forEach(p => {
        const m = computeProductMetrics(p);
        csv += `"${p.id}","${p.name}","${p.category || ''}","${p.supplier || ''}","${p.grams || ''}",${m.baseCost},${m.finalPVP},${m.fixedAmt},${m.sellerAmt},${m.netProfitAmt},${m.roiPct.toFixed(1)}\n`;
    });
    downloadCSV(csv, "catalogo_nexo.csv");
}

function openBizNameModal() {
    const inputName = document.getElementById('modalBizNameInput');
    const inputContact = document.getElementById('modalBizContactInput');
    if (inputName) inputName.value = state.bizConfig.name;
    if (inputContact) inputContact.value = state.bizConfig.contact;
    const modal = document.getElementById('bizNameModal');
    if (modal) modal.classList.add('open');
}

function closeBizNameModal() {
    const modal = document.getElementById('bizNameModal');
    if (modal) modal.classList.remove('open');
}

function saveBizName() {
    const inputName = document.getElementById('modalBizNameInput');
    const inputContact = document.getElementById('modalBizContactInput');
    state.bizConfig.name = (inputName ? inputName.value.trim() : '') || 'Mi Distribuidora';
    state.bizConfig.contact = inputContact ? inputContact.value.trim() : '';
    saveState();
    closeBizNameModal();
}