
const BUILD_VERSION = "BookFlow Commerce Suite 3.3.15";
const state = { user: null, books: [], cart: [], bestsellers: [], orders: [], lastOrder: null, pendingPayment: false, adminUsers: [], salesReport: null };

const el = (id) => document.getElementById(id);
const money = (v) => new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(Number(v || 0));
const coverColors = { "Kryminał": ["#0f172a", "#475569"], "Fantasy": ["#047857", "#06b6d4"], "Horror": ["#7f1d1d", "#ea580c"] };
const orderStatuses = [
  "Zamówienie w trakcie realizacji",
  "Zamówienie spakowane",
  "Zamówienie wysłane"
];

let savedScrollY = 0;

function openModal(html) {
  el("modalContent").innerHTML = html;
  const modal = el("modal");
  modal.classList.remove("hidden");
  savedScrollY = window.scrollY || window.pageYOffset || 0;
  document.body.classList.add("modal-open");
  document.body.style.top = `-${savedScrollY}px`;
  const card = modal.querySelector(".modal-card");
  if (card) card.scrollTop = 0;
}

function closeModal() {
  const modal = el("modal");
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  document.body.style.top = "";
  window.scrollTo(0, savedScrollY || 0);
}

function showConfirmModal(title, message) {
  openModal(`
    <div class="detail-grid">
      <div>
        <h3>${title}</h3>
        <p class="meta" style="margin-top:8px;">${message}</p>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:18px;">
        <button onclick="closeModal()">OK</button>
      </div>
    </div>
  `);
}


function orderNo() { return `ORD/${new Date().getFullYear()}/${Math.floor(Math.random()*9000)+1000}`; }
function receiptNo() { return `PAR/${new Date().getFullYear()}/${Math.floor(Math.random()*900000)+100000}`; }

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (res.headers.get("content-type")?.includes("application/json")) return { res, data: await res.json() };
  return { res, data: null };
}

function totalsFromCart() {
  const gross = state.cart.reduce((s, i) => s + i.price * i.qty, 0);
  const vatGroups = {};
  for (const item of state.cart) {
    const rate = item.vat;
    const grossValue = item.price * item.qty;
    const netValue = grossValue / (1 + rate / 100);
    const tax = grossValue - netValue;
    if (!vatGroups[rate]) vatGroups[rate] = { net: 0, tax: 0, gross: 0 };
    vatGroups[rate].net += netValue;
    vatGroups[rate].tax += tax;
    vatGroups[rate].gross += grossValue;
  }
  return { gross, vatGroups };
}

function renderStats() {
  el("topStats").innerHTML = `
    <div class="stat"><div class="muted">Książki</div><div class="price">${state.books.length}</div></div>
    <div class="stat"><div class="muted">Bestsellery</div><div class="price">${state.bestsellers.length}</div></div>
    <div class="stat"><div class="muted">W koszyku</div><div class="price">${state.cart.reduce((s,i)=>s+i.qty,0)}</div></div>`;
}

function initTabs() {
  document.querySelectorAll(".tabs-nav").forEach((nav) => {
    const buttons = nav.querySelectorAll(".tab-btn");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b) => b.classList.remove("active"));
        const container = nav.parentElement;
        container.querySelectorAll(":scope > .tab-pane").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        const pane = document.getElementById(btn.dataset.tab);
        if (pane) pane.classList.add("active");
      });
    });
  });
}


function availabilityLabel(book) {
  return book.available && book.stock > 0 ? `Dostępna • ${book.stock} szt.` : "Niedostępna";
}

function bookCard(book, small = false) {
  const [c1,c2] = coverColors[book.genre] || ["#334155","#64748b"];
  return `
  <div class="${small ? 'mini' : 'book'}">
    <div class="cover ${small ? 'small' : ''}" style="--c1:${c1};--c2:${c2}">
      <div><span class="badge">${book.genre}</span></div>
      <div>
        <div class="book-title ${small ? 'small' : ''}">${book.title}</div>
        <div class="cover-author">${book.author}</div>
      </div>
    </div>
    <div class="book-body">
      <div class="meta">${book.author}</div>
      <div class="meta book-stock">${availabilityLabel(book)}</div>
      <div class="meta">Sprzedano: ${book.sales} szt.</div>
      <div class="book-footer">
        <strong class="book-price">${money(book.price)}</strong>
        <div class="book-actions">
          <button class="secondary compact-btn" onclick="showProduct('${book.id}')">Szczegóły</button>
          <button class="compact-btn" ${(!book.available || book.stock <= 0) ? 'disabled' : ''} onclick="addToCart('${book.id}')">Dodaj</button>
        </div>
      </div>
    </div>
  </div>`;
}

function renderBestsellers() {
  el("bestsellers").innerHTML = state.bestsellers.map(b => bookCard(b, true)).join("");
}

function renderBooks() {
  el("books").innerHTML = state.books.map(bookCard).join("");
  renderStats();
}

function renderCart() {
  const target = el("cart");
  if (!state.cart.length) {
    target.innerHTML = '<div class="meta">Koszyk jest pusty.</div>';
    el("cartTotal").textContent = money(0);
    renderStats();
    return;
  }
  target.innerHTML = state.cart.map(item => `
    <div class="cart-item">
      <strong>${item.title}</strong><div class="meta">${item.author}</div>
      <div class="meta">Dostępne: ${item.stock} szt. • W koszyku: ${item.qty}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
        <div>${money(item.price)}</div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="secondary" onclick="changeQty('${item.id}',-1)">-</button>
          <span>${item.qty}</span>
          <button class="secondary" onclick="changeQty('${item.id}',1)">+</button>
        </div>
      </div>
    </div>
  `).join("");
  el("cartTotal").textContent = money(totalsFromCart().gross);
  renderStats();
}

function orderItemsHtml(items) {
  return items.map(i => `<li>${i.title} — ${i.qty} szt. × ${money(i.price)} = <strong>${money(i.qty * i.price)}</strong></li>`).join("");
}

function renderLastOrder() {
  const panel = el("orderSummaryPanel");
  if (!state.lastOrder) {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "block";
  const o = state.lastOrder;
  const paid = Boolean(o.payment_done || o.paymentDone);
  const paymentMessage = paid
    ? '<div class="status-banner success" style="display:block">Płatność dokonana. Zamówienie zostało przekazane do realizacji.</div>'
    : '<div class="status-banner info" style="display:block">Aby rozpocząć realizację zamówienia, wymagana jest płatność. Kliknij przycisk „Płatność”.</div>';
  const paymentAction = paid
    ? '<button class="secondary" disabled>Płatność dokonana</button>'
    : `<button onclick="payOrder('${o.order_no || o.orderNo}')">Płatność</button>`;
  el("orderSummary").innerHTML = `
    <div class="order-item">
      <div style="display:grid;gap:8px">
        <div><strong>Zamówienie złożone poprawnie</strong></div>
        ${paymentMessage}
        <div class="meta">Numer zamówienia: ${o.order_no || o.orderNo}</div>
        <div class="meta">Numer paragonu: ${o.receipt_no || o.receiptNo}</div>
        <div class="meta">Data: ${o.created_at || o.createdAt}</div>
        <div class="meta">Status: ${orderStatuses[o.status_index ?? o.statusIndex ?? 0] || orderStatuses[0]}</div>
        <div class="meta">Klient: ${o.customer_name || o.customerName}</div>
        <div class="meta">Email: ${o.buyer_email || o.buyerEmail}</div>
        <div class="meta">Płatność: ${paid ? `${o.payment_method || o.paymentMethod} • opłacona` : `${o.payment_method || o.paymentMethod} • oczekuje na opłacenie`}</div>
        <div><strong>Pozycje:</strong><ul>${orderItemsHtml(o.items || [])}</ul></div>
        <div><strong>Łącznie:</strong> ${money((o.totals?.gross) || 0)}</div>
        <div class="row-actions">
          ${paymentAction}
          <button onclick="printReceipt('${o.order_no || o.orderNo}')">Paragon PDF</button>
          <button class="secondary" onclick="printInvoice('${o.order_no || o.orderNo}')">Faktura PDF</button>
        </div>
      </div>
    </div>`;
}


function renderOrders() {
  const panel = el("ordersPanel");
  const emptyPanel = el("ordersEmptyPanel");
  if (!state.user) {
    panel.style.display = "none";
    if (emptyPanel) emptyPanel.style.display = "block";
    return;
  }
  panel.style.display = "block";
  if (emptyPanel) emptyPanel.style.display = "none";

  const title = state.user.role === "admin" ? "Historia zamówień administratora" : "Historia zamówień klienta";
  const subtitle = state.user.role === "admin"
    ? "Administrator widzi pełną historię wszystkich zamówień i może monitorować ich status."
    : "Tutaj znajdziesz pełną historię swoich zamówień, płatności oraz dokumentów PDF.";
  el("ordersTitle").textContent = title;
  el("ordersSubtitle").textContent = subtitle;

  const paidCount = state.orders.filter(o => Boolean(o.payment_done || o.paymentDone)).length;
  const pendingCount = state.orders.length - paidCount;
  const totalQty = state.orders.reduce((sum, o) => sum + (o.items || []).reduce((s, i) => s + Number(i.qty || 0), 0), 0);

  el("ordersStats").innerHTML = `
    <div class="history-pill"><div class="small">Zamówienia</div><strong>${state.orders.length}</strong></div>
    <div class="history-pill"><div class="small">Opłacone</div><strong>${paidCount}</strong></div>
    <div class="history-pill"><div class="small">Pozycje łącznie</div><strong>${totalQty}</strong></div>
    <div class="history-pill"><div class="small">Oczekuje na płatność</div><strong>${pendingCount}</strong></div>`;

  el("orders").innerHTML = state.orders.length ? state.orders.map(o => `
    <div class="order-item">
      <div class="order-history-role meta">${state.user.role === "admin" ? "Widok administratora" : "Widok klienta"}</div>
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
        <div>
          <strong>${o.order_no || o.orderNo}</strong>
          <div class="meta">${o.customer_name || o.customerName} • ${(o.buyer_email || o.buyerEmail) ?? ""}</div>
          <div class="meta">${orderStatuses[o.status_index ?? o.statusIndex ?? 0] || orderStatuses[0]} • ${(o.payment_done || o.paymentDone) ? "opłacone" : "oczekuje na płatność"}</div>
          <div class="meta">${(o.items || []).length} pozycji • ${(o.items || []).reduce((s,i)=>s+Number(i.qty||0),0)} szt.</div>
          <div class="meta">Forma płatności: ${o.payment_method || o.paymentMethod || "-"}</div>
        </div>
        <div style="text-align:right;min-width:220px">
          <div>${money((o.totals?.gross) || 0)}</div>
          <div class="row-actions" style="justify-content:flex-end;margin-top:8px;flex-wrap:wrap">
            <button class="secondary" onclick="showOrderDetails('${o.order_no || o.orderNo}')">Szczegóły</button>
            ${!(o.payment_done || o.paymentDone) ? `<button onclick="payOrder('${o.order_no || o.orderNo}')">Płatność</button>` : ""}
            <button class="secondary" onclick="printReceipt('${o.order_no || o.orderNo}')">Paragon PDF</button>
            <button class="secondary" onclick="printInvoice('${o.order_no || o.orderNo}')">Faktura PDF</button>
          </div>
        </div>
      </div>
    </div>
  `).join("") : '<div class="meta">Brak zamówień w historii.</div>';
}

function renderSession() {
  el("sessionInfo").textContent = state.user ? `Status sesji: zalogowano jako ${state.user.name} (${state.user.role === "admin" ? "administrator" : "klient"})` : "Status sesji: użytkownik jest wylogowany";
  if (state.user?.email) el("buyerEmail").value = state.user.email;
  const registerTabBtn = el("registerTabBtn");
  const registerTab = el("registerTab");
  const shouldShowRegister = !state.user || state.user.role === "admin";
  if (registerTabBtn) registerTabBtn.style.display = shouldShowRegister ? "" : "none";
  if (registerTab) registerTab.style.display = shouldShowRegister ? "" : "none";
  if (!shouldShowRegister && registerTab?.classList.contains("active")) {
    registerTab.classList.remove("active");
    const cartTab = el("cartTab");
    if (cartTab) cartTab.classList.add("active");
    document.querySelectorAll(".tabs-nav .tab-btn").forEach((btn) => btn.classList.remove("active"));
    const firstBtn = document.querySelector('.tabs-nav .tab-btn[data-tab="cartTab"]');
    if (firstBtn) firstBtn.classList.add("active");
  }
  renderOrders();
}

function renderAdminPanel() {
  const panel = el("adminPanel");
  if (!panel) return;
  if (state.user?.role === "admin") {
    panel.style.display = "block";
    renderAdminUsers();
    renderSalesReport();
  } else {
    panel.style.display = "none";
  }
}

function renderAdminUsers() {
  const target = el("adminUsers");
  if (!target) return;
  if (!state.adminUsers.length) {
    target.innerHTML = '<div class="meta">Brak zarejestrowanych użytkowników.</div>';
    return;
  }
  target.innerHTML = state.adminUsers.map((u) => `
    <div class="order-item">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
        <div>
          <strong>${u.name}</strong>
          <div class="meta">${u.email}</div>
          <div class="meta">Rola: ${u.role === "admin" ? "administrator" : "klient"}</div>
          <div class="meta">Telefon: ${u.phone || "brak"}</div>
        </div>
        <div style="min-width:260px">
          <div class="meta">Adres: ${[u.street, u.apartment].filter(Boolean).join(" / ") || "brak"}</div>
          <div class="meta">${u.postalCode || ""} ${u.city || ""}</div>
        </div>
      </div>
    </div>
  `).join("");
}

function renderSalesReport() {
  const target = el("salesReport");
  if (!target) return;
  const report = state.salesReport;
  if (!report) {
    target.innerHTML = '<div class="meta">Wybierz datę sprzedaży i kliknij „Pokaż raport”.</div>';
    return;
  }
  const rows = (report.orders || []).map((o) => `
    <tr>
      <td>${o.order_no || o.orderNo}</td>
      <td>${o.customer_name || o.customerName}</td>
      <td>${o.buyer_email || o.buyerEmail}</td>
      <td>${(o.items || []).reduce((s, i) => s + Number(i.qty || 0), 0)}</td>
      <td>${money(o.totals?.gross || 0)}</td>
    </tr>
  `).join("");
  target.innerHTML = `
    <div class="history-stats">
      <div class="history-pill"><div class="small">Data sprzedaży</div><strong>${report.dateLabel}</strong></div>
      <div class="history-pill"><div class="small">Liczba zamówień</div><strong>${report.ordersCount}</strong></div>
      <div class="history-pill"><div class="small">Liczba sztuk</div><strong>${report.itemsCount}</strong></div>
      <div class="history-pill"><div class="small">Wartość sprzedaży</div><strong>${money(report.grossTotal)}</strong></div>
    </div>
    <div class="report-table-wrap">
      <table class="report-table">
        <thead><tr><th>Numer zamówienia</th><th>Klient</th><th>Email</th><th>Sztuki</th><th>Wartość</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">Brak zamówień dla wybranej daty.</td></tr>'}</tbody>
      </table>
    </div>`;
}


function pushChat(role, text) {
  const div = document.createElement("div");
  div.className = `chat-bubble ${role}`;
  div.textContent = text;
  el("chatLog").appendChild(div);
  el("chatLog").scrollTop = el("chatLog").scrollHeight;
}
function showStatus(message, type = "info") {
  ["actionStatus", "actionStatusCart"].forEach((id) => {
    const box = document.getElementById(id);
    if (!box) return;
    box.textContent = message;
    box.className = `status-banner ${type}`;
    box.style.display = "block";
  });
}

async function loadBooks() {
  const q = encodeURIComponent(el("searchInput").value.trim());
  const genre = encodeURIComponent(el("genreFilter").value.trim());
  const { data } = await api(`/api/books?q=${q}&genre=${genre}`);
  state.books = data || [];
  renderBooks();
}

async function loadBestsellers() {
  const { data } = await api("/api/bestsellers");
  state.bestsellers = data || [];
  renderBestsellers();
}


async function loadAdminUsers() {
  if (state.user?.role !== "admin") return;
  const { res, data } = await api("/api/admin/users");
  if (res.ok) {
    state.adminUsers = data || [];
    renderAdminUsers();
  }
}

async function loadSalesReport() {
  if (state.user?.role !== "admin") return;
  const dateValue = el("salesReportDate")?.value;
  if (!dateValue) {
    state.salesReport = null;
    renderSalesReport();
    return;
  }
  const { res, data } = await api(`/api/admin/sales-report?date=${encodeURIComponent(dateValue)}`);
  if (!res.ok) return showStatus(data?.error || "Nie udało się pobrać raportu sprzedaży.", "error");
  state.salesReport = data;
  renderSalesReport();
}

async function loadSession() {
  const { data } = await api("/api/session");
  state.user = data?.user || null;
  renderSession();
  renderAdminPanel();
  if (state.user) {
    const { data: orders } = await api("/api/orders");
    state.orders = (orders || []).map(o => ({ ...o, paymentDone: Boolean(o.payment_done || o.paymentDone) }));
    if (!state.lastOrder && state.orders.length) state.lastOrder = state.orders[0];
    renderOrders();
    renderLastOrder();
    await loadAdminUsers();
    renderAdminPanel();
  } else {
    state.orders = [];
    state.lastOrder = null;
    state.adminUsers = [];
    state.salesReport = null;
    renderOrders();
    renderLastOrder();
    renderAdminPanel();
  }
}

window.addToCart = function(id) {
  const book = [...state.books, ...state.bestsellers].find(b => b.id === id);
  if (!book || !book.available || book.stock <= 0) {
    showStatus("Nie można dodać artykułu do Koszyka.", "error");
    return;
  }
  const found = state.cart.find(i => i.id === id);
  if (found) {
    if (found.qty >= book.stock) {
      showStatus("Nie można dodać artykułu do Koszyka.", "error");
      return;
    }
    found.qty = Math.min(found.qty + 1, book.stock);
  } else {
    state.cart.push({ ...book, qty: 1 });
  }
  renderCart();
  showStatus("Artykuł dodano do Koszyka.", "success");
  showConfirmModal("Potwierdzenie", "Artykuł dodano do Koszyka.");
}

window.changeQty = function(id, delta) {
  state.cart = state.cart.map(i => {
    if (i.id !== id) return i;
    const next = Math.max(0, Math.min(i.stock, i.qty + delta));
    return { ...i, qty: next };
  }).filter(i => i.qty > 0);
  renderCart();
}

window.showProduct = async function(id) {
  const { data } = await api(`/api/books/${id}`);
  const b = data;
  const [c1,c2] = coverColors[b.genre] || ["#334155","#64748b"];
  openModal(`
    <div class="product">
      <div><div class="cover" style="--c1:${c1};--c2:${c2}"><div><span class="badge">${b.genre}</span></div><div><div style="font-size:28px;font-weight:700;line-height:1.1">${b.title}</div><div style="margin-top:10px">${b.author}</div></div></div></div>
      <div>
        <h2 style="margin:0 0 8px">${b.title}</h2>
        <div class="meta">${b.author} • EAN ${b.ean}</div>
        <div class="meta" style="margin-top:8px">${availabilityLabel(b)}</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0">
          <div class="cart-item"><div class="meta">Cena</div><strong>${money(b.price)}</strong></div>
          <div class="cart-item"><div class="meta">Stan</div><strong>${b.stock}</strong></div>
          <div class="cart-item"><div class="meta">Sprzedaż</div><strong>${b.sales}</strong></div>
        </div>
        <p>${b.rag?.summary || "Brak opisu RAG."}</p>
        <p><strong>Opinia:</strong> ${b.rag?.review || "Brak opinii."}</p>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:16px">
          <button ${(!b.available || b.stock <= 0) ? 'disabled' : ''} onclick="addToCart('${b.id}');closeModal()">Dodaj do koszyka</button>
          <button class="secondary" onclick="closeModal()">Zamknij</button>
        </div>
        <h3 style="margin-top:20px">Polecane podobne tytuły</h3>
        <div class="grid grid-4">${(b.recommendations || []).map(r => `<div class="mini"><strong>${r.title}</strong><div class="meta">${r.author}</div><div class="meta">${availabilityLabel(r)}</div></div>`).join("")}</div>
      </div>
    </div>`);
}



window.showOrderDetails = function(orderNoValue) {
  const order = state.orders.find(o => (o.order_no || o.orderNo) === orderNoValue);
  if (!order) {
    showStatus("Nie znaleziono szczegółów wybranego zamówienia.", "error");
    return;
  }
  const paid = Boolean(order.payment_done || order.paymentDone);
  const orderStatus = orderStatuses[order.status_index ?? order.statusIndex ?? 0] || orderStatuses[0];
  openModal(`
    <div class="product">
      <div>
        <div class="cart-item">
          <div class="meta">Numer zamówienia</div>
          <strong>${order.order_no || order.orderNo}</strong>
        </div>
        <div style="height:12px"></div>
        <div class="cart-item">
          <div class="meta">Numer paragonu</div>
          <strong>${order.receipt_no || order.receiptNo || "-"}</strong>
        </div>
        <div style="height:12px"></div>
        <div class="cart-item">
          <div class="meta">Data sprzedaży</div>
          <strong>${order.created_at || order.createdAt || "-"}</strong>
        </div>
      </div>
      <div>
        <h2 style="margin:0 0 8px">Szczegóły zamówienia</h2>
        <div class="meta">${order.customer_name || order.customerName || "-"} • ${(order.buyer_email || order.buyerEmail) || "-"}</div>
        <div class="meta" style="margin-top:8px">Status realizacji: ${orderStatus}</div>
        <div class="meta">Płatność: ${(order.payment_method || order.paymentMethod || "-")} • ${paid ? "opłacona" : "oczekuje na opłacenie"}</div>
        ${order.buyer_nip || order.buyerNip ? `<div class="meta">NIP: ${order.buyer_nip || order.buyerNip}</div>` : ""}
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0">
          <div class="cart-item"><div class="meta">Pozycje</div><strong>${(order.items || []).length}</strong></div>
          <div class="cart-item"><div class="meta">Sztuki</div><strong>${(order.items || []).reduce((s,i)=>s+Number(i.qty||0),0)}</strong></div>
          <div class="cart-item"><div class="meta">Łącznie</div><strong>${money((order.totals?.gross) || 0)}</strong></div>
        </div>
        <div class="cart-item">
          <div class="meta" style="margin-bottom:8px">Pozycje zamówienia</div>
          <ul style="margin:0;padding-left:18px">${orderItemsHtml(order.items || [])}</ul>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:16px">
          ${!paid ? `<button onclick="payOrder('${order.order_no || order.orderNo}');closeModal()">Płatność</button>` : ""}
          <button onclick="printReceipt('${order.order_no || order.orderNo}')">Paragon PDF</button>
          <button class="secondary" onclick="printInvoice('${order.order_no || order.orderNo}')">Faktura PDF</button>
          <button class="secondary" onclick="closeModal()">Zamknij</button>
        </div>
      </div>
    </div>`);
}

function buildReceiptHtml(order, invoice = false) {
  const title = invoice ? "FAKTURA VAT / WYDRUK DEMO" : "PARAGON FISKALNY / WYDRUK DEMO";
  const numberLabel = invoice ? "Numer faktury" : "Numer paragonu";
  const numberValue = invoice ? `FV/${(order.order_no || order.orderNo).replaceAll("/", "-")}` : (order.receipt_no || order.receiptNo);
  const items = order.items || [];
  const rows = items.map((item, index) => `
    <tr><td>${index + 1}</td><td>${item.title}<br><small>EAN: ${item.ean}</small></td><td>${item.qty}</td><td>${money(item.price)}</td><td>${item.vat}%</td><td>${money(item.qty * item.price)}</td></tr>
  `).join("");
  const vatRows = Object.entries(order.totals?.vatGroups || {}).map(([rate, values]) => `
    <tr><td>${rate}%</td><td>${money(values.net)}</td><td>${money(values.tax)}</td><td>${money(values.gross)}</td></tr>
  `).join("");
  return `
  <html><head><meta charset="utf-8"><title>${title}</title>
  <style>body{font-family:Arial,sans-serif;padding:24px;color:#111}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px}.muted{color:#666}.box{border:1px solid #222;padding:16px}.total{font-size:18px;font-weight:700;margin-top:12px}</style>
  </head><body>
  <div class="box">
    <h2>${title}</h2>
    <p><strong>BookFlow Demo Sp. z o.o.</strong></p>
    <p>NIP sprzedawcy: 5250001234</p>
    <p>Adres: ul. Czytelnicza 12, 00-100 Warszawa</p>
    <p>Data sprzedaży: ${order.created_at || order.createdAt}</p>
    <p>Numer zamówienia: ${order.order_no || order.orderNo}</p>
    <p>${numberLabel}: ${numberValue}</p>
    ${order.buyer_nip || order.buyerNip ? `<p>NIP nabywcy: ${order.buyer_nip || order.buyerNip}</p>` : ""}
    <p>Nabywca: ${order.customer_name || order.customerName}</p>
    <p>Email: ${order.buyer_email || order.buyerEmail}</p>
    <p>Forma płatności: ${order.payment_method || order.paymentMethod}</p>
  </div>
  <h3>Pozycje</h3>
  <table><thead><tr><th>Lp.</th><th>Nazwa</th><th>Ilość</th><th>Cena brutto</th><th>VAT</th><th>Wartość brutto</th></tr></thead><tbody>${rows}</tbody></table>
  <h3>Podsumowanie VAT</h3>
  <table><thead><tr><th>Stawka</th><th>Netto</th><th>VAT</th><th>Brutto</th></tr></thead><tbody>${vatRows}</tbody></table>
  <p class="total">Razem do zapłaty: ${money(order.totals?.gross || 0)}</p>
  <p class="muted">Dokument demonstracyjny generowany z poziomu aplikacji w formacie do zapisu jako PDF.</p>
  <script>window.onload=()=>window.print()</script>
  </body></html>`;
}

window.printReceipt = function(orderNo) {
  const order = state.orders.find(o => (o.order_no || o.orderNo) === orderNo) || state.lastOrder;
  if (!order) return alert("Nie znaleziono zamówienia.");
  const w = window.open("", "_blank", "width=1000,height=900");
  w.document.write(buildReceiptHtml(order, false));
  w.document.close();
}

window.printInvoice = function(orderNo) {
  const order = state.orders.find(o => (o.order_no || o.orderNo) === orderNo) || state.lastOrder;
  if (!order) return alert("Nie znaleziono zamówienia.");
  const w = window.open("", "_blank", "width=1000,height=900");
  w.document.write(buildReceiptHtml(order, true));
  w.document.close();
}


window.payOrder = async function(orderNo) {
  const order = state.orders.find(o => (o.order_no || o.orderNo) === orderNo) || state.lastOrder;
  if (!order) return;
  order.paymentDone = true;
  order.payment_done = true;
  if (state.lastOrder && (state.lastOrder.order_no || state.lastOrder.orderNo) === orderNo) {
    state.lastOrder.paymentDone = true;
    state.lastOrder.payment_done = true;
  }
  renderOrders();
  renderLastOrder();
  showStatus("Płatność dokonana. Zamówienie idzie do realizacji.", "success");
}

async function checkout() {
  if (!state.user) {
    showStatus("Nie można zatwierdzić. Najpierw zaloguj się.", "error");
    return;
  }
  if (!state.cart.length) {
    showStatus("Nie można zatwierdzić. Koszyk jest pusty.", "error");
    return;
  }
  const buyerEmail = el("buyerEmail").value.trim();
  const buyerNip = el("buyerNip").value.trim();
  if (!buyerEmail) {
    showStatus("Nie można zatwierdzić. Podaj adres email klienta.", "error");
    return;
  }
  const payload = {
    orderNo: orderNo(),
    receiptNo: receiptNo(),
    createdAt: new Date().toLocaleString("pl-PL"),
    items: state.cart,
    buyerEmail,
    buyerNip,
    paymentMethod: el("paymentMethod").value,
    statusIndex: 0,
    totals: totalsFromCart(),
    customerName: state.user.name
  };
  const { res, data } = await api("/api/orders", { method: "POST", body: JSON.stringify(payload) });
  if (!res.ok) return showStatus(data?.error || "Nie można zatwierdzić zamówienia.", "error");
  state.lastOrder = { ...(data.order || payload), paymentDone: false };
  state.orders = [{ ...(data.order || payload), paymentDone: false }, ...state.orders];
  state.cart = [];
  el("buyerEmail").value = "";
  el("buyerNip").value = "";
  renderCart();
  renderOrders();
  renderLastOrder();
  showStatus("Zatwierdzono. Aby rozpocząć realizację, wymagana jest płatność.", "success");
  showConfirmModal("Potwierdzenie", "Zatwierdzono. Aby rozpocząć realizację, wymagana jest płatność.");
  await loadBooks();
  await loadBestsellers();
}

async function login() {
  const { res, data } = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: el("loginEmail").value, password: el("loginPassword").value })
  });
  if (!res.ok) return showStatus(data?.error || "Nie udało się zalogować.", "error");
  state.user = data.user;
  renderSession();
  showStatus(`Zalogowano pomyślnie. Witaj, ${data.user.name}.`, "success");
  await loadSession();
}

async function logout() {
  await api("/api/logout", { method: "POST" });
  state.user = null;
  state.orders = [];
  state.lastOrder = null;
  state.adminUsers = [];
  state.salesReport = null;
  renderSession();
  renderLastOrder();
  renderAdminPanel();
  showStatus("Wylogowano pomyślnie.", "info");
}

async function chat() {
  const q = el("chatInput").value.trim();
  if (!q) return;
  pushChat("user", q);
  el("chatInput").value = "";
  const { data } = await api("/api/chat", { method: "POST", body: JSON.stringify({ question: q }) });
  pushChat("bot", data.answer);
}

function clearChatField() {
  el("chatInput").value = "";
  el("chatInput").focus();
}
function clearChatConversation() {
  el("chatLog").innerHTML = "";
  pushChat("bot", "Dzień dobry! Chętnie pomogę znaleźć książkę, sprawdzić dostępność albo wskazać bestsellery. Napisz, czego szukasz.");
}


async function registerUser() {
  const name = el("registerName").value.trim();
  const email = el("registerEmail").value.trim();
  const password = el("registerPassword").value;
  const street = el("registerStreet").value.trim();
  const apartment = el("registerApartment").value.trim();
  const city = el("registerCity").value.trim();
  const postalCode = el("registerPostalCode").value.trim();
  const phone = el("registerPhone").value.trim();

  if (!name || !email || !password || !street || !city || !postalCode || !phone) {
    return showStatus("Uzupełnij dane konta oraz dane potrzebne do wysyłki: ulicę, miasto, kod pocztowy i numer telefonu.", "error");
  }

  const { res, data } = await api("/api/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password, street, apartment, city, postalCode, phone })
  });
  if (!res.ok) return showStatus(data?.error || "Nie udało się utworzyć konta.", "error");

  el("registerName").value = "";
  el("registerEmail").value = "";
  el("registerPassword").value = "";
  el("registerStreet").value = "";
  el("registerApartment").value = "";
  el("registerCity").value = "";
  el("registerPostalCode").value = "";
  el("registerPhone").value = "";
  el("loginEmail").value = email;
  el("loginPassword").value = password;
  showStatus("Konto zostało utworzone z danymi wysyłkowymi. Możesz się teraz zalogować.", "success");
}

el("searchBtn").addEventListener("click", loadBooks);
el("loginBtn").addEventListener("click", login);
el("logoutBtn").addEventListener("click", logout);
el("registerBtn").addEventListener("click", registerUser);
el("salesReportBtn").addEventListener("click", loadSalesReport);
el("checkoutBtn").addEventListener("click", checkout);
el("chatBtn").addEventListener("click", chat);
el("chatClearBtn").addEventListener("click", clearChatField);
el("chatResetBtn").addEventListener("click", clearChatConversation);
el("closeModal").addEventListener("click", closeModal);
el("modal").addEventListener("click", (e) => { if (e.target === el("modal")) closeModal(); });
el("chatInput").addEventListener("keydown", e => e.key === "Enter" && chat());
el("searchInput").addEventListener("keydown", e => e.key === "Enter" && loadBooks());
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el("modal").classList.contains("hidden")) closeModal(); });

(async function init() {
  initTabs();
  pushChat("bot", "Dzień dobry! Chętnie pomogę znaleźć książkę, sprawdzić dostępność albo wskazać bestsellery. Napisz, czego szukasz.");
  await loadBestsellers();
  await loadBooks();
  await loadSession();
  renderCart();
  renderLastOrder();
  renderAdminPanel();
})();
