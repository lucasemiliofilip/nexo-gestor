// ===================================================================
// NEXO | MÓDULO DE TESORERÍA & CIERRE DIARIO DE CAJA
// ===================================================================

let lastClosingReportData = null;

// Obtener fecha de hoy en formato DD/MM/YYYY
function getTodayArgentineString() {
    const now = new Date();
    return now.toLocaleDateString('es-AR');
}

// Convertir de YYYY-MM-DD (input date) a DD/MM/YYYY
function formatInputToArgDate(isoDateStr) {
    if (!isoDateStr) return getTodayArgentineString();
    const parts = isoDateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return isoDateStr;
}

// Inicializar el selector con la fecha de hoy
function initCajaDateInput() {
    const dateInput = document.getElementById('cajaClosingDate');
    if (dateInput && !dateInput.value) {
        const today = new Date();
        const pad = n => n.toString().padStart(2, '0');
        dateInput.value = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    }
}

// Cálculo principal del Cierre Diario
function calculateDailyClosing() {
    initCajaDateInput();
    const dateInput = document.getElementById('cajaClosingDate');
    const targetDate = formatInputToArgDate(dateInput ? dateInput.value : '');

    const salesOfDay = (state.sales || []).filter(s => s.date === targetDate);

    // Acumuladores: Pagado (Caja Real)
    let paidTotal = 0, paidFixed = 0, paidComm = 0, paidProfit = 0;
    // Acumuladores: Pendiente (Fiado)
    let pendTotal = 0, pendFixed = 0, pendComm = 0, pendProfit = 0;

    salesOfDay.forEach(s => {
        const tot = Number(s.total) || 0;
        const fix = Number(s.fixedContribution) || 0;
        const com = Number(s.sellerCommission) || 0;
        const prf = Number(s.netProfit) || 0;

        if (s.status === 'paid') {
            paidTotal += tot;
            paidFixed += fix;
            paidComm += com;
            paidProfit += prf;
        } else {
            pendTotal += tot;
            pendFixed += fix;
            pendComm += com;
            pendProfit += prf;
        }
    });

    // Costo de mercadería = Total facturado - (Fijos + Comisión + Ganancia)
    const paidStock = Math.max(0, paidTotal - (paidFixed + paidComm + paidProfit));
    const pendStock = Math.max(0, pendTotal - (pendFixed + pendComm + pendProfit));

    const grandTotal = paidTotal + pendTotal;
    const allStock = paidStock + pendStock;
    const allFixed = paidFixed + pendFixed;
    const allComm = paidComm + pendComm;
    const allProfit = paidProfit + pendProfit;

    lastClosingReportData = {
        date: targetDate,
        salesCount: salesOfDay.length,
        paid: { total: paidTotal, stock: paidStock, fixed: paidFixed, comm: paidComm, profit: paidProfit },
        pend: { total: pendTotal, stock: pendStock, fixed: pendFixed, comm: pendComm, profit: pendProfit },
        total: { total: grandTotal, stock: allStock, fixed: allFixed, comm: allComm, profit: allProfit }
    };

    renderCajaUI();
}

// Renderizar métricas en pantalla
function renderCajaUI() {
    if (!lastClosingReportData) return;
    const d = lastClosingReportData;

    // Métricas de encabezado
    const elDayBilled = document.getElementById('cajaDayBilled');
    if (elDayBilled) elDayBilled.textContent = fmtARS(d.total.total);

    const elDayCash = document.getElementById('cajaDayCash');
    if (elDayCash) elDayCash.textContent = fmtARS(d.paid.total);

    const elDayCredit = document.getElementById('cajaDayCredit');
    if (elDayCredit) elDayCredit.textContent = fmtARS(d.pend.total);

    // Bolsillo 1: Mercadería
    setPocketValues('pocketStock', d.paid.stock, d.pend.stock, d.total.stock);
    // Bolsillo 2: Fijos
    setPocketValues('pocketFixed', d.paid.fixed, d.pend.fixed, d.total.fixed);
    // Bolsillo 3: Comisiones
    setPocketValues('pocketComm', d.paid.comm, d.pend.comm, d.total.comm);
    // Bolsillo 4: Ganancia
    setPocketValues('pocketProfit', d.paid.profit, d.pend.profit, d.total.profit);

    runCashAudit();
}

function setPocketValues(prefix, paidVal, pendVal, totalVal) {
    const elCash = document.getElementById(`${prefix}Cash`);
    const elCredit = document.getElementById(`${prefix}Credit`);
    const elTotal = document.getElementById(`${prefix}Total`);

    if (elCash) elCash.textContent = fmtARS(paidVal);
    if (elCredit) elCredit.textContent = fmtARS(pendVal);
    if (elTotal) elTotal.textContent = fmtARS(totalVal);
}

// Arqueo físico de billetes
function runCashAudit() {
    if (!lastClosingReportData) return;
    const expectedCash = lastClosingReportData.paid.total;
    const countedInput = document.getElementById('cajaCountedCash');
    const countedCash = parseFloat(countedInput ? countedInput.value : 0) || 0;

    const diff = countedCash - expectedCash;
    const elDiff = document.getElementById('cajaAuditDiff');
    const elDiffBox = document.getElementById('cajaAuditBox');

    if (!elDiff || !elDiffBox) return;

    if (countedCash === 0) {
        elDiff.textContent = '$ 0,00';
        elDiffBox.className = 'p-4 rounded-xl border border-slate-800 bg-[#09101d]';
        return;
    }

    if (Math.abs(diff) < 1) {
        elDiff.textContent = 'Caja Exacta ($ 0,00)';
        elDiff.className = 'text-emerald-400 font-mono font-bold text-lg';
        elDiffBox.className = 'p-4 rounded-xl border border-emerald-500/40 bg-emerald-950/20';
    } else if (diff > 0) {
        elDiff.textContent = `Sobrante: +${fmtARS(diff)}`;
        elDiff.className = 'text-cyan-400 font-mono font-bold text-lg';
        elDiffBox.className = 'p-4 rounded-xl border border-cyan-500/40 bg-cyan-950/20';
    } else {
        elDiff.textContent = `Faltante: -${fmtARS(Math.abs(diff))}`;
        elDiff.className = 'text-rose-400 font-mono font-bold text-lg';
        elDiffBox.className = 'p-4 rounded-xl border border-rose-500/40 bg-rose-950/20';
    }
}

// Comprobante Oficial de Cierre Diario en PDF / Impresión A4
function printDailyClosingPDF() {
    if (!lastClosingReportData) {
        showToast('No hay cierre calculado');
        return;
    }

    const d = lastClosingReportData;
    const countedInput = document.getElementById('cajaCountedCash');
    const countedCash = parseFloat(countedInput ? countedInput.value : 0) || 0;
    const diff = countedCash - d.paid.total;

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Cierre Diario de Caja - ${d.date}</title>
            <style>
                @page { size: A4 portrait; margin: 12mm 15mm; }
                * { box-sizing: border-box; }
                body { margin: 0; padding: 0; font-family: 'Inter', sans-serif; color: #0f172a; background: #ffffff; }
                .header-box { border-bottom: 2.5px solid #0f172a; padding-bottom: 12px; display: flex; justify-content: space-between; }
                .biz-name { font-size: 20px; font-weight: 900; margin: 0; text-transform: uppercase; color: #0b2545; }
                .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 15px 0; }
                .summary-card { padding: 10px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; font-size: 11px; }
                .summary-val { font-size: 16px; font-weight: 900; font-family: monospace; margin-top: 4px; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
                th { background: #0f172a; color: #ffffff; padding: 8px 10px; text-transform: uppercase; font-size: 10px; }
                td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
                .pocket-name { font-weight: 800; font-size: 12px; }
                .audit-box { margin-top: 20px; padding: 12px; border: 1.5px solid #0f172a; border-radius: 6px; font-size: 12px; }
                .signatures { margin-top: 50px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; font-size: 11px; }
                .sign-line { border-top: 1px dashed #94a3b8; padding-top: 6px; font-weight: 700; }
            </style>
        </head>
        <body>
            <div class="header-box">
                <div>
                    <h1 class="biz-name">${state.bizConfig.name}</h1>
                    <p style="font-size:11px; color:#64748b; margin:2px 0;">${state.bizConfig.contact || 'Presidencia Roque Sáenz Peña, Chaco'} • Auditoría Diaria</p>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:14px; font-weight:900;">CIERRE DIARIO DE CAJA</div>
                    <div style="font-size:11px; color:#64748b; margin-top:2px;">Fecha Cierre: <strong>${d.date}</strong></div>
                </div>
            </div>

            <div class="summary-grid">
                <div class="summary-card">
                    <span>TOTAL FACTURADO:</span>
                    <div class="summary-val">${fmtARS(d.total.total)}</div>
                </div>
                <div class="summary-card" style="border-color:#10b981; background:#ecfdf5;">
                    <span style="color:#047857; font-weight:bold;">COBRADO EN MANO (CAJA):</span>
                    <div class="summary-val" style="color:#047857;">${fmtARS(d.paid.total)}</div>
                </div>
                <div class="summary-card" style="border-color:#f43f5e; background:#fff1f2;">
                    <span style="color:#be123c; font-weight:bold;">EN LA CALLE (FIADO):</span>
                    <div class="summary-val" style="color:#be123c;">${fmtARS(d.pend.total)}</div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="text-align:left;">DIVISIÓN FINANCIERA (SOBRES)</th>
                        <th style="text-align:right;">EN MANO (EFECTIVO)</th>
                        <th style="text-align:right;">EN LA CALLE (CTA. CTE.)</th>
                        <th style="text-align:right;">PROYECCIÓN TOTAL</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                            <div class="pocket-name">1. Mercadería (Reposición Stock)</div>
                            <span style="font-size:10px; color:#64748b;">Intocable para proveedores</span>
                        </td>
                        <td style="text-align:right; font-family:monospace; font-weight:bold;">${fmtARS(d.paid.stock)}</td>
                        <td style="text-align:right; font-family:monospace; color:#64748b;">${fmtARS(d.pend.stock)}</td>
                        <td style="text-align:right; font-family:monospace; font-weight:bold;">${fmtARS(d.total.stock)}</td>
                    </tr>
                    <tr>
                        <td>
                            <div class="pocket-name">2. Reserva Gastos Fijos</div>
                            <span style="font-size:10px; color:#64748b;">Alquiler, Secheep, servicios</span>
                        </td>
                        <td style="text-align:right; font-family:monospace; font-weight:bold; color:#2563eb;">${fmtARS(d.paid.fixed)}</td>
                        <td style="text-align:right; font-family:monospace; color:#64748b;">${fmtARS(d.pend.fixed)}</td>
                        <td style="text-align:right; font-family:monospace; font-weight:bold;">${fmtARS(d.total.fixed)}</td>
                    </tr>
                    <tr>
                        <td>
                            <div class="pocket-name">3. Comisión Vendedores</div>
                            <span style="font-size:10px; color:#64748b;">Reserva de fuerza comercial</span>
                        </td>
                        <td style="text-align:right; font-family:monospace; font-weight:bold; color:#7c3aed;">${fmtARS(d.paid.comm)}</td>
                        <td style="text-align:right; font-family:monospace; color:#64748b;">${fmtARS(d.pend.comm)}</td>
                        <td style="text-align:right; font-family:monospace; font-weight:bold;">${fmtARS(d.total.comm)}</td>
                    </tr>
                    <tr style="background:#f8fafc;">
                        <td>
                            <div class="pocket-name" style="color:#047857;">4. Tu Ganancia Neta Limpia</div>
                            <span style="font-size:10px; color:#047857;">Beneficio comercial real</span>
                        </td>
                        <td style="text-align:right; font-family:monospace; font-weight:900; color:#047857; font-size:13px;">${fmtARS(d.paid.profit)}</td>
                        <td style="text-align:right; font-family:monospace; color:#64748b;">${fmtARS(d.pend.profit)}</td>
                        <td style="text-align:right; font-family:monospace; font-weight:900; color:#047857;">${fmtARS(d.total.profit)}</td>
                    </tr>
                </tbody>
            </table>

            <div class="audit-box">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                    <span>Efectivo cobrado en sistema:</span>
                    <strong>${fmtARS(d.paid.total)}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                    <span>Efectivo contado en cajón:</span>
                    <strong>${fmtARS(countedCash)}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; border-top:1px solid #cbd5e1; padding-top:4px;">
                    <span>Diferencia de arqueo:</span>
                    <strong style="color:${diff >= 0 ? '#047857' : '#be123c'};">${diff >= 0 ? '+' : ''}${fmtARS(diff)}</strong>
                </div>
            </div>

            <div class="signatures">
                <div><div class="sign-line">Responsable de Caja / Arqueo</div></div>
                <div><div class="sign-line">Firma Administración / Titular</div></div>
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
    setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); }, 300);
}