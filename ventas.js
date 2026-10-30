// ===================================================================
// NEXO | MÓDULO COMERCIAL: VENTAS, CLIENTES, REMITOS & COMISIONES
// ===================================================================

let currentRemitoOrder = null;
let currentCart = [];
let lastGeneratedLiqReport = null; // Almacena el último reporte generado para PDF/Excel

// --- CLIENTES Y NIVELES VIP ---
function getClientTier(clientName) {
    if (!clientName) return { medal: '🥉', label: 'BRONCE', color: 'text-amber-600' };
    const purchases = (state.sales || [])
        .filter(s => s.client && s.client.toLowerCase() === clientName.toLowerCase())
        .reduce((s, x) => s + (Number(x.total) || 0), 0);

    if (purchases >= 1000000) return { medal: '🥇', label: 'ORO', color: 'text-amber-400' };
    if (purchases >= 300000) return { medal: '🥈', label: 'PLATA', color: 'text-slate-300' };
    return { medal: '🥉', label: 'BRONCE', color: 'text-amber-600' };
}

function populateSalesUI() {
    const selProd = document.getElementById('cartProductSelect');
    if (selProd) {
        selProd.innerHTML = (state.catalog || []).map(p => {
            const m = computeProductMetrics(p);
            return `<option value="${p.id}">${p.name} - ${fmtARS(m.finalPVP)}</option>`;
        }).join('');
    }

    const selCli = document.getElementById('saleClientSelect');
    if (selCli) {
        selCli.innerHTML = '<option value="">-- Cliente Nuevo / Escribir a Mano --</option>' + (state.clients || []).map(c => {
            const tier = getClientTier(c.name);
            return `<option value="${c.name}">${tier.medal} ${c.name} (${c.addr || 'Sáenz Peña'})</option>`;
        }).join('');
    }

    const selSeller = document.getElementById('saleSellerName');
    if (selSeller) {
        selSeller.innerHTML = (state.sellers || []).map(v => `<option value="${v.name}">${v.name}</option>`).join('');
    }

    updateLiveCartItemPreview();
}

function onSelectClientChange() {
    const val = document.getElementById('saleClientSelect').value;
    const badge = document.getElementById('clientMedalBadge');
    if (!val) {
        if (badge) badge.textContent = '';
        return;
    }
    const cli = (state.clients || []).find(c => c.name === val);
    if (cli) {
        document.getElementById('saleClientName').value = cli.name;
        document.getElementById('saleClientAddr').value = cli.addr || '';
        document.getElementById('saleClientPhone').value = cli.phone || '';
        const tier = getClientTier(cli.name);
        if (badge) {
            badge.textContent = `${tier.medal} Nivel ${tier.label}`;
            badge.className = `text-xs font-bold ${tier.color}`;
        }
    }
}

function saveClientDirectly() {
    const name = document.getElementById('saleClientName').value.trim();
    const addr = document.getElementById('saleClientAddr').value.trim();
    const phone = document.getElementById('saleClientPhone').value.trim();

    if (!name) {
        showToast('Ingresá el nombre o razón social del cliente');
        return;
    }

    let existing = state.clients.find(c => c.name.toLowerCase() === name.toLowerCase());

    if (existing) {
        existing.addr = addr;
        existing.phone = phone;
        showToast(`¡Cliente "${name}" actualizado!`);
    } else {
        state.clients.push({ id: Date.now(), name, addr, phone });
        showToast(`¡Cliente "${name}" guardado con éxito!`);
    }
    saveState();
    populateSalesUI();
    document.getElementById('saleClientSelect').value = name;
    onSelectClientChange();
}

function deleteClient(id) {
    const cli = state.clients.find(c => c.id === id);
    if (!cli) return;
    if (confirm(`¿Deseas eliminar a "${cli.name}" de tus clientes?`)) {
        state.clients = state.clients.filter(c => c.id !== id);
        saveState();
        populateSalesUI();
        openClientDirectoryModal();
        showToast('Cliente eliminado');
    }
}

function openClientDirectoryModal() {
    const list = document.getElementById('clientDirectoryList');
    if (!list) return;
    if (state.clients.length === 0) {
        list.innerHTML = '<p class="text-slate-500 text-xs text-center py-4">No hay clientes guardados aún.</p>';
    } else {
        list.innerHTML = state.clients.map(c => {
            const tier = getClientTier(c.name);
            const totalSpent = state.sales.filter(s => s.client && s.client.toLowerCase() === c.name.toLowerCase()).reduce((s, x) => s + (Number(x.total) || 0), 0);
            return `
                <div class="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                    <div class="flex items-center gap-2.5">
                        <span class="text-2xl">${tier.medal}</span>
                        <div>
                            <span class="font-bold text-white text-sm block">${c.name}</span>
                            <span class="text-[10px] text-slate-400">${c.addr || 'Sin dirección'} • Tel: ${c.phone || '-'}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-4">
                        <div class="text-right">
                            <span class="font-mono font-bold text-emerald-400 block">${fmtARS(totalSpent)}</span>
                            <span class="text-[9px] uppercase font-bold ${tier.color}">Nivel ${tier.label}</span>
                        </div>
                        <button onclick="deleteClient(${c.id})" title="Eliminar cliente" class="text-slate-500 hover:text-rose-400 p-1">
                            <i class="fa-solid fa-trash text-xs"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }
    document.getElementById('clientDirectoryModal').classList.add('open');
}

function closeClientDirectoryModal() {
    document.getElementById('clientDirectoryModal').classList.remove('open');
}

// --- CARRITO EN VIVO Y CÁLCULOS ---
function updateLiveCartItemPreview() {
    const prodSelect = document.getElementById('cartProductSelect');
    if (!prodSelect || !prodSelect.value) return;
    
    const prodId = Number(prodSelect.value);
    const qty = parseFloat(document.getElementById('cartItemQty').value) || 1;
    const disc = parseFloat(document.getElementById('cartItemDisc').value) || 0;
    const prod = (state.catalog || []).find(p => p.id === prodId);

    if (!prod) return;

    const m = computeProductMetrics(prod);
    const unitListPVP = m.finalPVP;
    const discAmtUnit = unitListPVP * (disc / 100);
    const unitFinalPVP = unitListPVP - discAmtUnit;
    const subtotal = unitFinalPVP * qty;

    const netProfitUnit = m.netProfitAmt - discAmtUnit;

    document.getElementById('liveItemSubtotal').textContent = fmtARS(subtotal);
    document.getElementById('liveItemUnitPVP').textContent = `${fmtARS(unitFinalPVP)} ${disc > 0 ? `(Lista: ${fmtARS(unitListPVP)} -${disc}%)` : ''}`;

    const previewBox = document.getElementById('cartItemLivePreview');
    if (!previewBox) return;

    if (disc === 0) {
        previewBox.className = 'p-2.5 rounded bg-slate-900 border border-slate-800 text-[11px] space-y-1';
    } else if (netProfitUnit < 0) {
        previewBox.className = 'p-2.5 rounded bg-rose-950/40 border border-rose-500/60 text-[11px] space-y-1 animate-pulse';
    } else {
        previewBox.className = 'p-2.5 rounded bg-blue-950/30 border border-blue-500/40 text-[11px] space-y-1';
    }
}

function addItemToCart() {
    const prodId = Number(document.getElementById('cartProductSelect').value);
    const qty = parseFloat(document.getElementById('cartItemQty').value) || 1;
    const disc = parseFloat(document.getElementById('cartItemDisc').value) || 0;
    const prod = state.catalog.find(p => p.id === prodId);
    if (!prod) return;

    const m = computeProductMetrics(prod);
    const discAmt = m.finalPVP * (disc / 100);
    const unitPrice = m.finalPVP - discAmt;
    const netProfit = (m.netProfitAmt - discAmt) * qty;

    currentCart.push({
        prodId: prod.id,
        name: prod.name,
        grams: prod.grams || '',
        listPVP: m.finalPVP,
        qty,
        disc,
        unitPrice,
        total: unitPrice * qty,
        fixedContrib: m.fixedAmt * qty,
        sellerComm: m.sellerAmt * qty,
        netProfit
    });

    document.getElementById('cartItemQty').value = 1;
    document.getElementById('cartItemDisc').value = 0;
    updateLiveCartItemPreview();
    renderCartUI();
}

function removeCartItem(idx) {
    currentCart.splice(idx, 1);
    renderCartUI();
}

function renderCartUI() {
    const cList = document.getElementById('cartItemsList');
    if (!cList) return;

    let grandTotal = 0, totalFixed = 0, totalComm = 0, totalProfit = 0;

    cList.innerHTML = currentCart.map((item, idx) => {
        grandTotal += item.total;
        totalFixed += item.fixedContrib;
        totalComm += item.sellerComm;
        totalProfit += item.netProfit;

        return `
            <div class="flex items-center justify-between bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
                <div>
                    <span class="font-bold text-white">${item.name}</span>
                    <span class="text-[10px] text-slate-400 block">${item.qty} un. ${item.disc > 0 ? `(-${item.disc}%)` : ''} • ${fmtARS(item.unitPrice)} c/u</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="font-mono font-bold text-emerald-400">${fmtARS(item.total)}</span>
                    <button onclick="removeCartItem(${idx})" class="text-slate-500 hover:text-rose-400"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('cartOrderGrandTotal').textContent = fmtARS(grandTotal);
    document.getElementById('cartOrderFixed').textContent = fmtARS(totalFixed);
    document.getElementById('cartOrderComm').textContent = fmtARS(totalComm);
    document.getElementById('cartOrderProfit').textContent = fmtARS(totalProfit);
}

function commitOrderSale() {
    if (currentCart.length === 0) {
        showToast('Agregá al menos un artículo al pedido');
        return;
    }

    const client = document.getElementById('saleClientName').value.trim();
    if (!client) {
        showToast('Ingresá el nombre del cliente');
        return;
    }

    const addr = document.getElementById('saleClientAddr').value.trim();
    const phone = document.getElementById('saleClientPhone').value.trim();
    const seller = document.getElementById('saleSellerName').value.trim() || 'Mostrador';
    const status = document.getElementById('salePayStatus').value;

    let cliObj = state.clients.find(c => c.name.toLowerCase() === client.toLowerCase());
    if (!cliObj) {
        cliObj = { id: Date.now(), name: client, addr, phone };
        state.clients.push(cliObj);
    } else {
        cliObj.addr = addr;
        cliObj.phone = phone;
    }

    const grandTotal = currentCart.reduce((s, x) => s + x.total, 0);
    const totalFixed = currentCart.reduce((s, x) => s + x.fixedContrib, 0);
    const totalComm = currentCart.reduce((s, x) => s + x.sellerComm, 0);
    const totalProfit = currentCart.reduce((s, x) => s + x.netProfit, 0);

    const now = new Date();
    const dateStr = now.toLocaleDateString('es-AR');
    const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    const newSale = {
        id: Date.now(),
        date: dateStr,
        time: timeStr,
        client, addr, phone, seller, status,
        items: [...currentCart],
        total: grandTotal,
        fixedContribution: totalFixed,
        sellerCommission: totalComm,
        netProfit: totalProfit
    };

    state.sales.unshift(newSale);

    currentCart = [];
    renderCartUI();
    document.getElementById('saleClientName').value = '';
    document.getElementById('saleClientAddr').value = '';
    document.getElementById('saleClientPhone').value = '';
    saveState();
    showToast('¡Venta registrada con éxito!');
    openRemitoModal(newSale.id);
}

// --- HISTORIAL DE VENTAS DESGLOSADO ---
function renderSalesHistory() {
    const tb = document.getElementById('salesHistoryBody');
    if (!tb) return;
    const badgeT5 = document.getElementById('badge-tab5');
    if (badgeT5) badgeT5.textContent = state.sales.length;
    populateSalesUI();

    let tBill = 0, tDebt = 0, tProf = 0, tFixed = 0, tCash = 0;

    tb.innerHTML = (state.sales || []).map(s => {
        const total = Number(s.total) || 0;
        const profit = Number(s.netProfit) || 0;
        const fixed = Number(s.fixedContribution) || 0;
        const comm = Number(s.sellerCommission) || 0;

        tBill += total;
        tProf += profit;
        tFixed += fixed;

        if (s.status === 'pending') {
            tDebt += total;
        } else {
            tCash += total;
        }

        const tier = getClientTier(s.client);
        const timeLabel = s.time ? ` - ${s.time}` : '';

        return `
            <tr class="hover:bg-slate-900/50">
                <td class="py-2.5 px-2">
                    <div class="flex items-center gap-1.5">
                        <span class="text-sm">${tier.medal}</span>
                        <div>
                            <span class="font-bold text-white block text-xs">${s.client}</span>
                            <span class="text-[10px] text-slate-400 font-mono">${s.date}${timeLabel}</span>
                        </div>
                    </div>
                </td>
                <td class="text-right font-mono font-bold text-white">${fmtARS(total)}</td>
                <td class="text-right font-mono text-blue-400">${fmtARS(fixed)}</td>
                <td class="text-right font-mono text-purple-300">${fmtARS(comm)}</td>
                <td class="text-right font-mono font-bold text-emerald-400">${fmtARS(profit)}</td>
                <td class="text-center">
                    <button onclick="togglePayment(${s.id})" class="px-2 py-0.5 rounded text-[10px] font-bold ${s.status === 'paid' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}">
                        ${s.status === 'paid' ? '🟢 Pagado' : '🟡 Fiado'}
                    </button>
                </td>
                <td class="text-center">
                    <div class="flex items-center justify-center gap-2">
                        <button onclick="openRemitoModal(${s.id})" class="text-xs text-blue-400 hover:text-blue-300"><i class="fa-solid fa-receipt"></i> Remito</button>
                        <button onclick="deleteSale(${s.id})" class="text-slate-500 hover:text-rose-400"><i class="fa-solid fa-trash text-xs"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    const elBilled = document.getElementById('t5-totalBilled');
    if (elBilled) elBilled.textContent = fmtARS(tBill);
    const elCash = document.getElementById('t5-cashPaid');
    if (elCash) elCash.textContent = fmtARS(tCash);
    const elDebt = document.getElementById('t5-streetDebt');
    if (elDebt) elDebt.textContent = fmtARS(tDebt);
    const elProf = document.getElementById('t5-realNetProfit');
    if (elProf) elProf.textContent = fmtARS(tProf);
    const elFixed = document.getElementById('t5-realFixedFund');
    if (elFixed) elFixed.textContent = 'Reserva Fijos: ' + fmtARS(tFixed);

    const totalFixedExp = getTotalFixedExpenses();
    const remainingBE = Math.max(0, totalFixedExp - tFixed);
    const elRemBE = document.getElementById('t5-remainingBreakEven');
    if (elRemBE) elRemBE.textContent = fmtARS(remainingBE);
}

function togglePayment(id) {
    const s = state.sales.find(x => x.id === id);
    if (s) { s.status = s.status === 'paid' ? 'pending' : 'paid'; saveState(); }
}

function deleteSale(id) {
    if (confirm('¿Eliminar esta venta?')) {
        state.sales = state.sales.filter(x => x.id !== id);
        saveState();
    }
}

function exportSalesCSV() {
    let csv = "ID,Fecha,Hora,Cliente,Direccion,Telefono,Vendedor,Estado,Total,Reserva_Fijos,Comision,Ganancia_Limpia\n";
    state.sales.forEach(s => {
        csv += `"${s.id}","${s.date}","${s.time || ''}","${s.client}","${s.addr || ''}","${s.phone || ''}","${s.seller}","${s.status}",${s.total},${s.fixedContribution},${s.sellerCommission},${s.netProfit}\n`;
    });
    downloadCSV(csv, "ventas_nexo.csv");
}

function downloadCSV(content, filename) {
    const blob = new Blob(["\uFEFF" + content], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
}

// --- PESTAÑA 6: VENDEDORES Y COMISIONES ---
function renderSellersTab() {
    const sellersArr = Array.isArray(state.sellers) ? state.sellers : [{ id: 1, name: 'Mostrador', phone: '' }];
    const badgeTab = document.getElementById('sellerCountBadgeTab');
    if (badgeTab) badgeTab.textContent = sellersArr.length;
    const badgeCard = document.getElementById('sellerCountBadge');
    if (badgeCard) badgeCard.textContent = sellersArr.length;
    
    const list = document.getElementById('sellersListContainer');
    if (list) {
        list.innerHTML = sellersArr.map(v => `
            <div class="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                <div>
                    <span class="font-bold text-white block">${v.name}</span>
                    <span class="text-[10px] text-slate-400 font-mono"><i class="fa-solid fa-phone text-[9px] mr-1"></i>${v.phone || '-'}</span>
                </div>
                ${v.name !== 'Mostrador' ? `
                    <button onclick="deleteSeller(${v.id})" class="text-slate-500 hover:text-rose-400 p-1">
                        <i class="fa-solid fa-trash text-xs"></i>
                    </button>
                ` : '<span class="text-[10px] text-slate-500 font-bold uppercase">Base</span>'}
            </div>
        `).join('');
    }

    const selLiq = document.getElementById('liqSellerSelect');
    if (selLiq) selLiq.innerHTML = sellersArr.map(v => `<option value="${v.name}">${v.name}</option>`).join('');
    
    const selVenta = document.getElementById('saleSellerName');
    if (selVenta) selVenta.innerHTML = sellersArr.map(v => `<option value="${v.name}">${v.name}</option>`).join('');
}

function addSeller(e) {
    e.preventDefault();
    const name = document.getElementById('sellerName').value.trim();
    const phone = document.getElementById('sellerPhone').value.trim();

    if (!name) return;
    if (!Array.isArray(state.sellers)) state.sellers = [{ id: 1, name: 'Mostrador', phone: '' }];

    const existing = state.sellers.find(v => v.name.toLowerCase() === name.toLowerCase());
    if (existing) {
        showToast('Ya existe un vendedor con ese nombre');
        return;
    }

    state.sellers.push({ id: Date.now(), name, phone });
    document.getElementById('sellerName').value = '';
    document.getElementById('sellerPhone').value = '';
    saveState();
    showToast('Vendedor agregado con éxito');
}

function deleteSeller(id) {
    const seller = state.sellers.find(v => v.id === id);
    if (seller && seller.name === 'Mostrador') return; 
    if (confirm('¿Eliminar este vendedor? Las ventas anteriores se mantendrán registradas.')) {
        state.sellers = state.sellers.filter(v => v.id !== id);
        saveState();
        showToast('Vendedor eliminado');
    }
}

function setLiqDates(period) {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    let dFrom, dTo;

    if (period === 'month') {
        dFrom = new Date(y, m, 1);
        dTo = new Date(y, m + 1, 0);
    } else if (period === 'q1') {
        dFrom = new Date(y, m, 1);
        dTo = new Date(y, m, 15);
    } else if (period === 'q2') {
        dFrom = new Date(y, m, 16);
        dTo = new Date(y, m + 1, 0);
    }

    const pad = (n) => n.toString().padStart(2, '0');
    document.getElementById('liqDateFrom').value = `${dFrom.getFullYear()}-${pad(dFrom.getMonth()+1)}-${pad(dFrom.getDate())}`;
    document.getElementById('liqDateTo').value = `${dTo.getFullYear()}-${pad(dTo.getMonth()+1)}-${pad(dTo.getDate())}`;
}

// --- LIQUIDADOR DE COMISIONES & EXPORTACIÓN ---
function generateSellerReport() {
    const sellerName = document.getElementById('liqSellerSelect').value;
    const dateFromStr = document.getElementById('liqDateFrom').value;
    const dateToStr = document.getElementById('liqDateTo').value;

    if (!sellerName || !dateFromStr || !dateToStr) {
        showToast('Completá el vendedor y las fechas');
        return;
    }

    const dFrom = new Date(dateFromStr + "T00:00:00");
    const dTo = new Date(dateToStr + "T23:59:59");

    const filteredSales = (state.sales || []).filter(s => {
        if (s.seller !== sellerName) return false;
        const sDate = parseArgentineDate(s.date);
        return sDate >= dFrom && sDate <= dTo;
    });

    const report = {};
    let totalBilled = 0;
    let totalComm = 0;

    filteredSales.forEach(s => {
        totalBilled += s.total;
        totalComm += s.sellerCommission;
        
        const items = s.items || [{ name: s.prodName, qty: s.qty, unitPrice: s.unitPrice, sellerComm: s.sellerCommission, total: s.total }];
        
        items.forEach(it => {
            if (!report[it.name]) {
                report[it.name] = { qty: 0, billed: 0, comm: 0, grams: it.grams || '' };
            }
            report[it.name].qty += Number(it.qty) || 0;
            report[it.name].billed += Number(it.total) || 0;
            report[it.name].comm += Number(it.sellerComm) || 0;
        });
    });

    // Guardar para exportaciones PDF y Excel
    lastGeneratedLiqReport = {
        sellerName,
        dateFromStr,
        dateToStr,
        report,
        totalBilled,
        totalComm
    };

    document.getElementById('resLiqTotalSales').textContent = fmtARS(totalBilled);
    document.getElementById('resLiqTotalComm').textContent = fmtARS(totalComm);

    const tb = document.getElementById('liqTableBody');
    if (!tb) return;

    // Asegurar encabezado de tabla profesional
    const tableEl = tb.closest('table');
    if (tableEl && !tableEl.querySelector('thead')) {
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr class="border-b border-slate-700 text-slate-400 uppercase text-[10px]">
                <th class="py-2.5 px-3">Producto Vendido</th>
                <th class="py-2.5 px-3 text-center">Cantidad</th>
                <th class="py-2.5 px-3 text-right">Facturación</th>
                <th class="py-2.5 px-3 text-right text-purple-400">Comisión Generada</th>
            </tr>
        `;
        tableEl.insertBefore(thead, tb);
    }

    if (Object.keys(report).length === 0) {
        tb.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-slate-500 text-xs italic">No hay ventas registradas para este vendedor en el período seleccionado.</td></tr>`;
    } else {
        tb.innerHTML = Object.keys(report).sort().map(productName => {
            const row = report[productName];
            return `
                <tr class="hover:bg-slate-900/50">
                    <td class="py-2.5 px-3">
                        <span class="font-bold text-white block">${productName}</span>
                        <span class="text-[9px] text-slate-400 font-mono">${row.grams}</span>
                    </td>
                    <td class="py-2.5 px-3 text-center font-mono font-bold text-slate-200">${row.qty} un.</td>
                    <td class="py-2.5 px-3 text-right font-mono text-slate-400">${fmtARS(row.billed)}</td>
                    <td class="py-2.5 px-3 text-right font-mono font-bold text-purple-400">${fmtARS(row.comm)}</td>
                </tr>
            `;
        }).join('');
    }

    // Inyectar botones de descarga (PDF y Excel) si aún no existen
    let actionsBox = document.getElementById('liqExportActionsContainer');
    const resultsArea = document.getElementById('liqResultsArea');
    if (!actionsBox && resultsArea) {
        actionsBox = document.createElement('div');
        actionsBox.id = 'liqExportActionsContainer';
        actionsBox.className = 'flex flex-wrap gap-2 justify-end pt-3 border-t border-slate-800';
        actionsBox.innerHTML = `
            <button type="button" onclick="exportSellerCommissionCSV()" class="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs px-3.5 py-2.5 rounded-xl border border-slate-700 transition flex items-center gap-2">
                <i class="fa-solid fa-file-excel text-emerald-400"></i> Descargar Excel (CSV)
            </button>
            <button type="button" onclick="printSellerCommissionPDF()" class="bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-2 shadow-lg shadow-purple-600/30">
                <i class="fa-solid fa-file-pdf"></i> Imprimir / Guardar PDF Liquidación
            </button>
        `;
        resultsArea.appendChild(actionsBox);
    }

    resultsArea.classList.remove('hidden');
}

// --- EXPORTAR EXCEL DE COMISIONES ---
function exportSellerCommissionCSV() {
    if (!lastGeneratedLiqReport || Object.keys(lastGeneratedLiqReport.report).length === 0) {
        showToast('No hay liquidación generada para exportar');
        return;
    }

    const { sellerName, dateFromStr, dateToStr, report, totalBilled, totalComm } = lastGeneratedLiqReport;
    
    let csv = `LIQUIDACION DE COMISIONES - ${state.bizConfig.name}\n`;
    csv += `Vendedor:,"${sellerName}"\n`;
    csv += `Periodo:,"${dateFromStr} al ${dateToStr}"\n`;
    csv += `Fecha Emision:,"${new Date().toLocaleDateString('es-AR')}"\n\n`;
    csv += `Producto,Presentacion,Cantidad,Total Facturado ($),Comision ($)\n`;

    Object.keys(report).sort().forEach(prodName => {
        const item = report[prodName];
        csv += `"${prodName}","${item.grams}",${item.qty},${item.billed.toFixed(2)},${item.comm.toFixed(2)}\n`;
    });

    csv += `\nTOTALES,,,"${totalBilled.toFixed(2)}","${totalComm.toFixed(2)}"\n`;

    const cleanSeller = sellerName.toLowerCase().replace(/\s+/g, '_');
    downloadCSV(csv, `liquidacion_${cleanSeller}_${dateFromStr}_al_${dateToStr}.csv`);
    showToast('Planilla Excel descargada');
}

// --- IMPRIMIR / PDF OFICIAL DE LIQUIDACIÓN PARA EL VENDEDOR ---
function printSellerCommissionPDF() {
    if (!lastGeneratedLiqReport || Object.keys(lastGeneratedLiqReport.report).length === 0) {
        showToast('No hay liquidación generada para exportar');
        return;
    }

    const { sellerName, dateFromStr, dateToStr, report, totalBilled, totalComm } = lastGeneratedLiqReport;
    const today = new Date().toLocaleDateString('es-AR');

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Liquidación de Comisiones - ${sellerName}</title>
            <style>
                @page { size: A4 portrait; margin: 12mm 15mm; }
                * { box-sizing: border-box; }
                body { margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; background: #ffffff; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                .liq-container { width: 100%; padding: 10px; }
                .header-box { border-bottom: 2.5px solid #0f172a; padding-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-start; }
                .biz-name { font-size: 20px; font-weight: 900; margin: 0; text-transform: uppercase; color: #0b2545; }
                .biz-sub { font-size: 11px; color: #64748b; margin: 3px 0 0 0; }
                .doc-badge { border: 2px solid #0f172a; padding: 6px 12px; border-radius: 6px; text-align: right; background: #f8fafc; }
                .doc-title { font-size: 13px; font-weight: 900; margin: 0; text-transform: uppercase; }
                .doc-num { font-size: 11px; color: #64748b; margin-top: 2px; }
                .info-banner { display: grid; grid-template-columns: 2fr 1fr; gap: 15px; margin-top: 14px; padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12px; }
                .info-row { margin-bottom: 4px; }
                .info-label { font-weight: 800; color: #334155; }
                table.items-table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
                table.items-table th { background: #0f172a; color: #ffffff; font-weight: 800; text-transform: uppercase; padding: 8px 10px; font-size: 10px; letter-spacing: 0.5px; }
                table.items-table td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
                table.items-table tr:nth-child(even) td { background: #f8fafc; }
                .totals-card { margin-top: 16px; display: flex; justify-content: flex-end; }
                .totals-box { width: 340px; border: 2px solid #0f172a; border-radius: 8px; padding: 12px 14px; background: #ffffff; font-size: 13px; }
                .totals-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
                .grand-total { font-size: 18px; font-weight: 900; color: #7c3aed; font-family: monospace; }
                .signatures-area { margin-top: 50px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; font-size: 11px; color: #475569; }
                .sign-line { border-top: 1px dashed #94a3b8; padding-top: 6px; font-weight: 700; color: #0f172a; }
                .footer-note { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
            </style>
        </head>
        <body>
            <div class="liq-container">
                <div class="header-box">
                    <div>
                        <h1 class="biz-name">${state.bizConfig.name}</h1>
                        <p class="biz-sub">${state.bizConfig.contact || 'Presidencia Roque Sáenz Peña, Chaco'} • Reporte Comercial</p>
                    </div>
                    <div class="doc-badge">
                        <div class="doc-title">LIQUIDACIÓN DE COMISIÓN</div>
                        <div class="doc-num">Emisión: ${today}</div>
                    </div>
                </div>

                <div class="info-banner">
                    <div>
                        <div class="info-row"><span class="info-label">VENDEDOR:</span> <strong style="font-size:13px; text-transform:uppercase;">${sellerName}</strong></div>
                        <div class="info-row"><span class="info-label">DISTRIBUIDORA:</span> ${state.bizConfig.name}</div>
                    </div>
                    <div>
                        <div class="info-row"><span class="info-label">PERÍODO:</span> ${dateFromStr} al ${dateToStr}</div>
                        <div class="info-row"><span class="info-label">ESTADO:</span> <strong style="color:#059669;">LIQUIDADO / APROBADO</strong></div>
                    </div>
                </div>

                <table class="items-table">
                    <thead>
                        <tr>
                            <th style="text-align:left;">PRODUCTO VENDIDO</th>
                            <th style="text-align:center; width:80px;">CANTIDAD</th>
                            <th style="text-align:right; width:120px;">FACTURACIÓN</th>
                            <th style="text-align:right; width:130px;">COMISIÓN GENERADA</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.keys(report).sort().map(prodName => {
                            const row = report[prodName];
                            return `
                                <tr>
                                    <td>
                                        <strong>${prodName}</strong>
                                        ${row.grams ? `<span style="color:#64748b; font-size:10px; display:block;">${row.grams}</span>` : ''}
                                    </td>
                                    <td style="text-align:center; font-family:monospace; font-weight:bold;">${row.qty} un.</td>
                                    <td style="text-align:right; font-family:monospace;">${fmtARS(row.billed)}</td>
                                    <td style="text-align:right; font-family:monospace; font-weight:800; color:#7c3aed;">${fmtARS(row.comm)}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>

                <div class="totals-card">
                    <div class="totals-box">
                        <div class="totals-row" style="color:#475569;">
                            <span>Total Facturado en Ventas:</span>
                            <strong style="font-family:monospace;">${fmtARS(totalBilled)}</strong>
                        </div>
                        <div class="totals-row" style="border-top:1.5px solid #0f172a; padding-top:8px; margin-top:6px; align-items:baseline;">
                            <span style="font-size:12px; font-weight:900;">TOTAL COMISIÓN A COBRAR:</span>
                            <span class="grand-total">${fmtARS(totalComm)}</span>
                        </div>
                    </div>
                </div>

                <div class="signatures-area">
                    <div>
                        <div class="sign-line">Firma y Sello de la Empresa</div>
                        <div style="font-size:9px; color:#94a3b8; margin-top:2px;">${state.bizConfig.name}</div>
                    </div>
                    <div>
                        <div class="sign-line">Recibí Conforme Comisión (Firma Vendedor)</div>
                        <div style="font-size:9px; color:#94a3b8; margin-top:2px;">Aclaración / DNI: _______________________</div>
                    </div>
                </div>

                <div class="footer-note">
                    <span>Comprobante interno de liquidación y pago de haberes comerciales.</span>
                    <span>Potenciado por Nexo | Conectándote con tu negocio</span>
                </div>
            </div>
        </body>
        </html>
    `;

    const frame = document.getElementById('printIsolatedFrame');
    if (!frame) return;
    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(() => {
        frame.contentWindow.focus();
        frame.contentWindow.print();
    }, 300);
}

// --- REMITO OFICIAL A4 ---
function openRemitoModal(saleId) {
    const s = state.sales.find(x => x.id === saleId);
    if (!s) return;
    currentRemitoOrder = s;

    document.getElementById('remitoBizTitle').textContent = state.bizConfig.name;
    const timePart = s.time ? ` • ${s.time}` : '';
    document.getElementById('remitoClientInfo').textContent = `${s.client} • ${s.addr || 'Sáenz Peña'} • Tel: ${s.phone || '-'} • Fecha: ${s.date}${timePart} • Vendedor: ${s.seller || 'Mostrador'}`;
    
    const itemsTable = document.getElementById('remitoItemsTable');
    const items = s.items || [{ name: s.prodName, qty: s.qty, unitPrice: s.unitPrice, total: s.total }];

    itemsTable.innerHTML = items.map(it => `
        <div class="flex justify-between items-center py-1 border-b border-slate-900">
            <div>
                <span class="font-bold text-white">${it.name}</span>
                <span class="text-[10px] text-slate-400 block">${it.qty} un. x ${fmtARS(it.unitPrice)}</span>
            </div>
            <span class="font-mono font-bold text-slate-200">${fmtARS(it.total)}</span>
        </div>
    `).join('');

    document.getElementById('remitoGrandTotal').textContent = fmtARS(s.total);
    document.getElementById('remitoModal').classList.add('open');
}

function closeRemitoModal() {
    document.getElementById('remitoModal').classList.remove('open');
}

function sendRemitoWhatsApp() {
    if (!currentRemitoOrder) return;
    const s = currentRemitoOrder;
    const items = s.items || [{ name: s.prodName, qty: s.qty, total: s.total }];
    let msg = `*${state.bizConfig.name}*\n📄 *COMPROBANTE DE VENTA*\nCliente: ${s.client}\nFecha: ${s.date}\n--------------------------\n`;
    items.forEach(it => { msg += `• *${it.qty} un.* x ${it.name} → *${fmtARS(it.total)}*\n`; });
    msg += `--------------------------\n*TOTAL: ${fmtARS(s.total)}*`;

    const cleanPhone = (s.phone || '').replace(/\D/g, '');
    const url = cleanPhone ? `https://wa.me/549${cleanPhone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
}

function executeIsolatedRemitoPrint() {
    if (!currentRemitoOrder) return;
    const s = currentRemitoOrder;
    const items = s.items || [{ name: s.prodName || 'Artículo', qty: s.qty || 1, unitPrice: s.unitPrice || s.total, total: s.total }];
    const tier = getClientTier(s.client);

    const html = `
        <!DOCTYPE html><html><head><meta charset="UTF-8"><title>Remito</title>
        <style>
            @page { size: A4 portrait; margin: 12mm 15mm; }
            body { font-family: sans-serif; color: #111; padding: 10px; margin: 0; }
            .header { border-bottom: 2px solid #111; padding-bottom: 10px; display: flex; justify-content: space-between; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
            th { background: #0f172a; color: #fff; padding: 6px; text-align: left; }
            td { padding: 8px; border-bottom: 1px solid #ddd; }
            .total { text-align: right; font-size: 16px; font-weight: bold; margin-top: 15px; }
        </style>
        </head><body>
            <div class="header">
                <div><h2>${state.bizConfig.name}</h2><p>${state.bizConfig.contact || 'Presidencia Roque Sáenz Peña'}</p></div>
                <div style="text-align:right;"><h3>REMITO DE ENTREGA</h3><p>Fecha: ${s.date}</p></div>
            </div>
            <div style="background:#f8f9fa; padding:10px; border-radius:6px; margin-top:10px; font-size:12px;">
                <p><strong>Cliente:</strong> ${s.client} (${tier.medal} Nivel ${tier.label}) | <strong>Dir:</strong> ${s.addr || '-'} | <strong>Tel:</strong> ${s.phone || '-'}</p>
                <p><strong>Vendedor:</strong> ${s.seller || 'Mostrador'} | <strong>Estado:</strong> ${s.status === 'paid' ? 'PAGADO' : 'PENDIENTE (FIADO)'}</p>
            </div>
            <table>
                <thead><tr><th>Cant.</th><th>Descripción</th><th style="text-align:right;">P. Unit</th><th style="text-align:right;">Importe</th></tr></thead>
                <tbody>${items.map(it => `<tr><td>${it.qty}</td><td>${it.name}</td><td style="text-align:right;">${fmtARS(it.unitPrice)}</td><td style="text-align:right;">${fmtARS(it.total)}</td></tr>`).join('')}</tbody>
            </table>
            <div class="total">TOTAL FACTURADO: ${fmtARS(s.total)}</div>
        </body></html>
    `;

    const frame = document.getElementById('printIsolatedFrame');
    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); }, 300);
}

// ===================================================================
// MOTOR UNIFICADO: CONEXIÓN ENTRE NÚCLEO Y MÓDULOS
// ===================================================================
function refreshAllViews() {
    try {
        const elBiz = document.getElementById('headerBizName');
        if (elBiz) elBiz.textContent = state.bizConfig.name;
        updateCloudStatusUI(false);
        
        // Vistas de sistema.js
        if (typeof renderExpensesTab === 'function') renderExpensesTab();
        if (typeof runCalculator === 'function') runCalculator();
        if (typeof renderCatalog === 'function') renderCatalog();
        if (typeof renderMixTab === 'function') renderMixTab();
        
        // Vistas de ventas.js
        if (typeof renderSalesHistory === 'function') renderSalesHistory();
        if (typeof renderSellersTab === 'function') renderSellersTab();
    } catch (err) {
        console.error("Error al refrescar vistas:", err);
    }
}

// Arranque seguro cuando el navegador termina de leer todo
window.addEventListener('DOMContentLoaded', () => {
    refreshAllViews();
});