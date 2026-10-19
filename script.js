const KEY = "finance-helper-v1";
const MAX_AMOUNT = 999_999_999_999;
const SLICE_COLORS = ["#e07a5f", "#3d6f8d", "#e85d4c", "#c6a15b", "#7b6cf6", "#1f6b45", "#2a9d8f", "#6a4b12"];
const CATEGORY_META = {
  "exp-credit": { icon: "card", color: "#f08a6a" },
  "exp-util": { icon: "bolt", color: "#5b8def" },
  "exp-food": { icon: "food", color: "#ef6d7a" },
  "exp-personal": { icon: "user", color: "#e2b15a" },
  "exp-school": { icon: "book", color: "#8b7cf6" },
  "inc-salary": { icon: "wallet", color: "#3cba8b" },
  "inc-side": { icon: "case", color: "#3aa8c1" },
  "inc-other": { icon: "dots", color: "#d27ba8" },
};
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MONTHS_NOM = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const DEFAULT_CATEGORIES = [
  { id: "exp-credit", name: "Кредиты", type: "expense" },
  { id: "exp-util", name: "Коммунальные платежи", type: "expense" },
  { id: "exp-food", name: "Еда", type: "expense" },
  { id: "exp-personal", name: "Личные расходы", type: "expense" },
  { id: "exp-school", name: "Оплата за школу", type: "expense" },
  { id: "inc-salary", name: "Зарплата", type: "income" },
  { id: "inc-side", name: "Подработка", type: "income" },
  { id: "inc-other", name: "Другое", type: "income" },
];
const NAV = [
  ["home", "Дом", "home"],
  ["list", "Список", "list"],
  ["charts", "График", "chart"],
  ["debts", "Долги", "debts"],
  ["limits", "Лимит", "limit"],
];
const TITLES = {
  home: "Главная",
  add: "Новая запись",
  edit: "Изменить запись",
  list: "Записи",
  charts: "Диаграммы",
  debts: "Долги",
  limits: "Лимиты",
};

const app = document.getElementById("app");
let state = load();
let formError = "";
let draftTx = null;
let returnTo = "home";
let chartPeriod = "month";
let debtTab = "gave";
let debtEditId = "";
let debtDraft = null;
let limitDraft = null;
let pendingConfirm = null;
let filters = monthFilters();

function fresh() {
  return {
    categories: DEFAULT_CATEGORIES.map((item) => ({ ...item })),
    transactions: [],
    debts: [],
    limits: [],
    theme: "light",
  };
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!data || !Array.isArray(data.transactions) || !Array.isArray(data.debts) || !Array.isArray(data.limits)) return fresh();
    data.categories = DEFAULT_CATEGORIES.map((item) => ({ ...item }));
    data.theme = data.theme === "dark" ? "dark" : "light";
    return data;
  } catch {
    return fresh();
  }
}

function persist() {
  localStorage.setItem(KEY, JSON.stringify(state));
  render();
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function ymd(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayInTashkent() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dateParts(date) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}

function addDays(date, days) {
  const parts = dateParts(date);
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return next.toISOString().slice(0, 10);
}

function addYears(date, years) {
  const parts = dateParts(date);
  const last = new Date(Date.UTC(parts.year + years, parts.month, 0)).getUTCDate();
  return ymd(parts.year + years, parts.month, Math.min(parts.day, last));
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const parts = dateParts(value);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return date.getUTCFullYear() === parts.year && date.getUTCMonth() === parts.month - 1 && date.getUTCDate() === parts.day;
}

function monthBounds(date) {
  const parts = dateParts(date);
  const last = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
  return { from: ymd(parts.year, parts.month, 1), to: ymd(parts.year, parts.month, last) };
}

function monthFilters() {
  const bounds = monthBounds(todayInTashkent());
  return { from: bounds.from, to: bounds.to, type: "", category_id: "" };
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function formatLong(date) {
  const parts = dateParts(date);
  return `${parts.day} ${MONTHS_GEN[parts.month - 1]} ${parts.year}`;
}

function monthTitle(date) {
  const parts = dateParts(date);
  return `${MONTHS_NOM[parts.month - 1]} ${parts.year}`;
}

function money(amount) {
  const value = Math.trunc(Math.abs(Number(amount) || 0));
  return `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} сум`;
}

function recordsLabel(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "запись";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "записи";
  return "записей";
}

function signedMoney(amount) {
  const number = Number(amount) || 0;
  return number < 0 ? `−${money(number)}` : money(number);
}

function parseAmount(raw) {
  const text = String(raw ?? "").trim().replace(/\s/g, "");
  if (!/^\d+$/.test(text)) return null;
  const amount = Number(text);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_AMOUNT) return null;
  return amount;
}

function categoriesOf(type) {
  return state.categories.filter((item) => item.type === type);
}

function categoryName(id) {
  return state.categories.find((item) => item.id === id)?.name || "Без категории";
}

function categoryIcon(id) {
  return CATEGORY_META[id]?.icon || "dots";
}

function categoryColor(id, index = 0) {
  return CATEGORY_META[id]?.color || SLICE_COLORS[index % SLICE_COLORS.length];
}

function iconBadge(id) {
  const color = id ? categoryColor(id) : "#9a7340";
  const glyph = id ? categoryIcon(id) : "limit";
  return `<span class="cat-ico" style="background:${color}">${icon(glyph)}</span>`;
}

function smartTip() {
  const today = todayInTashkent();
  const bounds = monthBounds(today);
  const month = summary(bounds.from, bounds.to);
  const daysInMonth = daysBetween(bounds.from, bounds.to) + 1;
  const daysPassed = Math.max(1, daysBetween(bounds.from, today) + 1);
  const daysLeft = Math.max(1, daysBetween(today, bounds.to) + 1);
  const rows = expenseByCategory(bounds.from, bounds.to).filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount);
  const pace = Math.round((month.expense / daysPassed) * daysInMonth);
  const top = rows[0];
  const overall = limitStatuses().find((item) => !item.category_id);

  if (!month.expense && !month.income) {
    return {
      glyph: "spark",
      color: "#9a7340",
      title: "Жду первую запись",
      text: "Добавьте расход или доход. Смарт сравнит категории и прикинет, сколько выйдет к концу месяца.",
    };
  }
  if (overall && overall.level !== "ok") {
    const room = Math.max(overall.amount - overall.spent, 0);
    const perDay = Math.floor(room / daysLeft);
    return {
      glyph: "spark",
      color: overall.level === "danger" ? "#8d2f2a" : "#a16207",
      title: overall.level === "danger" ? "Общий лимит уже превышен" : "Общий лимит близко",
      text: room
        ? `Чтобы остаться в лимите, на каждый из ${daysLeft} оставшихся дней лучше тратить около ${money(perDay)}.`
        : "Новые расходы в этом месяце уже сверх общего лимита.",
    };
  }
  if (top && month.expense > 0 && top.amount / month.expense >= 0.4) {
    return {
      glyph: categoryIcon(top.id),
      color: categoryColor(top.id),
      title: `${top.name} тянет бюджет`,
      text: `Это ${formatPercent((top.amount / month.expense) * 100)}% расходов. Такими темпами за ${monthTitle(bounds.from)} выйдет около ${money(pace)}.`,
    };
  }
  if (month.expense > month.income) {
    return {
      glyph: "spark",
      color: "#8d2f2a",
      title: "Расходы обгоняют доходы",
      text: `Разница ${money(month.expense - month.income)}. Если темп сохранится, к концу месяца расходы будут около ${money(pace)}.`,
    };
  }
  return {
    glyph: "spark",
    color: "#1f6b45",
    title: "Темп спокойный",
    text: month.expense
      ? `За ${daysPassed} дн. потрачено ${money(month.expense)}. К концу месяца при том же темпе выйдет около ${money(pace)}.`
      : `Доходы ${money(month.income)}, расходов в этом месяце пока нет.`,
  };
}

function inRange(date, from, to) {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function summary(from, to) {
  const rows = state.transactions.filter((item) => inRange(item.date, from, to));
  const income = rows.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
  const expense = rows.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  return { income, expense, balance: income - expense };
}

function expenseSum(from, to, categoryId) {
  return state.transactions
    .filter((item) => item.type === "expense" && inRange(item.date, from, to) && (!categoryId || item.category_id === categoryId))
    .reduce((sum, item) => sum + item.amount, 0);
}

function compareTx(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return (a.created_at || "") < (b.created_at || "") ? 1 : -1;
}

function periodRange(period) {
  const today = todayInTashkent();
  if (period === "day") return { from: today, to: today };
  if (period === "week") return { from: addDays(today, -6), to: today };
  return monthBounds(today);
}

function expenseByCategory(from, to) {
  return categoriesOf("expense").map((category) => ({
    id: category.id,
    name: category.name,
    amount: expenseSum(from, to, category.id),
  }));
}

function expenseByDay(from, to) {
  const rows = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    rows.push({ date, amount: expenseSum(date, date) });
  }
  return rows;
}

function limitStatuses() {
  const bounds = monthBounds(todayInTashkent());
  return state.limits.map((limit) => {
    const categoryId = limit.category_id || "";
    const spent = expenseSum(bounds.from, bounds.to, categoryId);
    const percent = limit.amount > 0 ? (spent / limit.amount) * 100 : 0;
    let level = "ok";
    if (percent >= 100) level = "danger";
    else if (percent >= 80) level = "warning";
    return {
      ...limit,
      category_id: categoryId,
      name: categoryId ? categoryName(categoryId) : "Общий",
      spent,
      percent,
      level,
    };
  }).sort((a, b) => {
    if (!a.category_id) return -1;
    if (!b.category_id) return 1;
    return a.name.localeCompare(b.name, "ru");
  });
}

function formatPercent(percent) {
  const rounded = Math.round(percent * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function advice() {
  const tips = [];
  const push = (text, tone) => {
    if (tips.length < 5) tips.push({ text, tone });
  };
  const statuses = limitStatuses();
  statuses.forEach((item) => {
    if (item.level === "danger") {
      push(item.category_id ? `Лимит по категории ${item.name} превышен.` : "Общий лимит превышен.", "danger");
    }
  });
  statuses.forEach((item) => {
    if (item.level === "warning") {
      const percent = formatPercent(item.percent);
      push(item.category_id
        ? `Вы израсходовали ${percent}% лимита по категории ${item.name}.`
        : `Вы израсходовали ${percent}% общего лимита.`, "warning");
    }
  });

  const today = todayInTashkent();
  const bounds = monthBounds(today);
  const month = summary(bounds.from, bounds.to);
  if (month.expense > month.income) {
    push(`Расходы превышают доходы на ${money(month.expense - month.income)}.`, "warning");
  }

  const currentFrom = addDays(today, -6);
  const previousTo = addDays(today, -7);
  const previousFrom = addDays(today, -13);
  const current = expenseSum(currentFrom, today);
  const previous = expenseSum(previousFrom, previousTo);
  if (previous === 0 && current > 0) {
    push("Расходы за последние 7 дней выросли более чем на 30% по сравнению с предыдущими 7 днями.", "info");
  } else if (previous > 0 && (current - previous) / previous > 0.3) {
    const growth = Math.round(((current - previous) / previous) * 100);
    push(`Расходы за последние 7 дней выросли на ${growth}% по сравнению с предыдущими 7 днями.`, "info");
  }

  const byCategory = expenseByCategory(bounds.from, bounds.to);
  const monthExpense = byCategory.reduce((sum, item) => sum + item.amount, 0);
  byCategory.forEach((item) => {
    if (monthExpense > 0 && item.amount / monthExpense > 0.4) {
      push(`Категория ${item.name} занимает ${formatPercent((item.amount / monthExpense) * 100)}% расходов месяца.`, "info");
    }
  });

  const overall = statuses.find((item) => !item.category_id);
  if (overall) {
    const daysLeft = daysBetween(today, bounds.to) + 1;
    const perDay = Math.floor(Math.max(overall.amount - overall.spent, 0) / daysLeft);
    push(`На каждый оставшийся день можно потратить около ${money(perDay)}.`, "info");
  }

  state.debts.forEach((debt) => {
    if (!debt.is_closed && debt.due_date && debt.due_date < today) {
      push(`Долг «${debt.person_name}» просрочен.`, "warning");
    }
  });

  const recentFrom = addDays(today, -2);
  const hasRecent = state.transactions.some((item) => item.date >= recentFrom && item.date <= today);
  if (!hasRecent) push("За последние 3 дня нет записей. Внесите расходы.", "info");
  return tips;
}

function route() {
  const hash = location.hash.replace(/^#/, "") || "/home";
  const match = /^\/([^/]+)(?:\/([^/]+))?/.exec(hash);
  const screen = TITLES[match?.[1]] ? match[1] : "home";
  return { screen, id: match?.[2] || "" };
}

function go(screen, id) {
  formError = "";
  const next = `#/${screen}${id ? `/${id}` : ""}`;
  if (location.hash === next) render();
  else location.hash = next;
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme === "dark" ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", state.theme === "dark" ? "#10151d" : "#e4eef8");
}

function icon(name) {
  const paths = {
    home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M7 10.5V20h10v-9.5"/>',
    list: '<path d="M8 7h12M8 12h12M8 17h12"/><path d="M4 7h.01M4 12h.01M4 17h.01"/>',
    chart: '<path d="M4 19V5M4 19h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
    debts: '<path d="M12 3v18"/><path d="M7 8h7a3 3 0 0 1 0 6H8"/><path d="M8 14h8a3 3 0 0 1 0 6H7"/>',
    limit: '<path d="M12 21a8 8 0 1 0-8-8"/><path d="M12 13V7"/><path d="M4 16h4l2 3"/>',
    sun: '<circle cx="12" cy="12" r="3.4"/><path d="M12 3.2v2.2M12 18.6v2.2M3.2 12h2.2M18.6 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18"/>',
    moon: '<path d="M15.5 3.6A7.6 7.6 0 1 0 20.4 16 6 6 0 0 1 15.5 3.6z"/>',
    card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/>',
    bolt: '<path d="M13 3 5 13h6l-1 8 8-10h-6l1-8z"/>',
    food: '<path d="M4 3v6a3 3 0 0 0 3 3h1a3 3 0 0 0 3-3V3"/><path d="M8 12v9"/><path d="M19 3a4 4 0 0 0-4 4v5h4V3z"/><path d="M19 12v9"/>',
    user: '<circle cx="12" cy="8" r="3.2"/><path d="M5.2 19.5c1.2-3.2 3.4-4.8 6.8-4.8s5.6 1.6 6.8 4.8"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 5.5V20.5"/><path d="M8 7h8M8 11h8"/>',
    wallet: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M3 11h18"/><path d="M16 15h.01"/>',
    case: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V6.5A1.5 1.5 0 0 1 9.5 5h5A1.5 1.5 0 0 1 16 6.5V8"/><path d="M3 13h18"/>',
    dots: '<circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
    spark: '<path d="M12 3.2 13.6 8.6 19 10.2 13.6 11.8 12 17.2 10.4 11.8 5 10.2 10.4 8.6z"/><path d="M18 14.2l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7z"/>',
  };
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ""}</svg>`;
}

function themeButton() {
  const dark = state.theme === "dark";
  return `<button class="theme-btn" type="button" data-action="toggle-theme">${icon(dark ? "sun" : "moon")}<span>${dark ? "Светлая" : "Тёмная"}</span></button>`;
}

function nav() {
  const { screen } = route();
  const links = NAV.map(([key, label, glyph]) => {
    const active = key === screen || (key === "list" && (screen === "add" || screen === "edit"));
    return `<button type="button" data-action="go" data-go="${key}" class="${active ? "active" : ""}"${active ? ' aria-current="page"' : ""}>${icon(glyph)}<span>${label}</span></button>`;
  }).join("");
  return `<nav class="nav"><div class="nav-side"><div class="nav-links">${links}</div></div></nav>`;
}

function options(items, selected, placeholder) {
  const head = placeholder ? `<option value="">${esc(placeholder)}</option>` : "";
  return head + items.map((item) => `<option value="${esc(item.id)}"${item.id === selected ? " selected" : ""}>${esc(item.name)}</option>`).join("");
}

function errorBox() {
  return formError ? `<p class="note note-bad" role="alert">${esc(formError)}</p>` : "";
}

function txDraft() {
  const { screen, id } = route();
  if (screen === "edit") {
    if (draftTx && draftTx.id === id) return draftTx;
    const found = state.transactions.find((item) => item.id === id);
    if (!found) return null;
    draftTx = {
      id: found.id,
      type: found.type,
      amount: String(found.amount),
      category_id: found.category_id,
      date: found.date,
      note: found.note || "",
    };
    return draftTx;
  }
  if (draftTx && !draftTx.id) return draftTx;
  draftTx = {
    id: "",
    type: "expense",
    amount: "",
    category_id: categoriesOf("expense")[0].id,
    date: todayInTashkent(),
    note: "",
  };
  return draftTx;
}

function homeScreen() {
  const bounds = monthBounds(todayInTashkent());
  const totals = summary(bounds.from, bounds.to);
  const tips = advice();
  const limits = limitStatuses();
  const recent = [...state.transactions].sort(compareTx).slice(0, 10);
  return `<section class="stats">
      <article class="card"><p class="muted">Доходы</p><p class="stat-value ok">${money(totals.income)}</p><p class="small muted">${esc(monthTitle(bounds.from))}</p></article>
      <article class="card"><p class="muted">Расходы</p><p class="stat-value bad">${money(totals.expense)}</p><p class="small muted">${esc(monthTitle(bounds.from))}</p></article>
      <article class="card"><p class="muted">Баланс</p><p class="stat-value ${totals.balance < 0 ? "bad" : "ok"}">${signedMoney(totals.balance)}</p><p class="small muted">доходы минус расходы</p></article>
    </section>
    ${homeChart(bounds)}
    ${smartCard()}
    <section class="card stack">
      <h2>Лимиты</h2>
      ${limits.length ? limits.map(limitRow).join("") : `<p class="muted">Лимиты не заданы.</p>`}
    </section>
    <section class="stack">
      <h2>Советы</h2>
      ${tips.length ? tips.map((tip) => `<p class="note note-${tip.tone === "danger" ? "bad" : tip.tone === "warning" ? "warn" : "info"}">${esc(tip.text)}</p>`).join("") : `<p class="note note-ok">Советов пока нет.</p>`}
    </section>
    <section class="stack">
      <div class="spread"><h2>Последние записи</h2><button class="btn slim" type="button" data-action="add" data-back="home">Добавить</button></div>
      ${recent.length ? recent.map((item) => txCard(item)).join("") : `<p class="card muted">Записей пока нет.</p>`}
    </section>
    <p class="small muted">Данные хранятся в этом браузере и остаются после перезагрузки страницы.</p>`;
}

function homeChart(bounds) {
  const rows = expenseByCategory(bounds.from, bounds.to).filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((sum, item) => sum + item.amount, 0);
  return `<section class="card stack">
    <div class="spread"><h2>Расходы за месяц</h2><strong>${money(total)}</strong></div>
    ${total ? `<div class="home-chart">
      <div class="chart-box donut"><canvas data-chart="home" aria-label="Расходы по категориям за месяц"></canvas></div>
      <div class="legend">${rows.map((item) => `<div class="legend-row">
        <span class="legend-name">${iconBadge(item.id)}<span><strong>${esc(item.name)}</strong><br><span class="small muted">${formatPercent((item.amount / total) * 100)}%</span></span></span>
        <span class="money">${money(item.amount)}</span>
      </div>`).join("")}</div>
    </div>` : `<p class="muted">В этом месяце расходов ещё нет.</p>`}
  </section>`;
}

function smartCard() {
  const tip = smartTip();
  return `<section class="card smart">
    <p class="kicker">Смарт</p>
    <div class="legend-name" style="margin-top:0.45rem"><span class="cat-ico" style="background:${tip.color}">${icon(tip.glyph)}</span><h2>${esc(tip.title)}</h2></div>
    <p style="margin-top:0.55rem">${esc(tip.text)}</p>
  </section>`;
}

function limitRow(item) {
  const width = Math.max(0, Math.min(item.percent, 100));
  const label = item.level === "danger" ? "превышен" : item.level === "warning" ? "близко к лимиту" : "в норме";
  return `<div class="stack">
    <div class="spread"><span class="legend-name">${iconBadge(item.category_id)}<strong>${esc(item.name)}</strong></span><span class="${item.level === "ok" ? "ok" : item.level}">${formatPercent(item.percent)}% · ${label}</span></div>
    <div class="bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(item.percent)}" aria-label="${esc(item.name)}"><span class="${item.level}" style="width:${width}%"></span></div>
    <p class="small muted">${money(item.spent)} из ${money(item.amount)}</p>
  </div>`;
}

function txCard(item, withActions = true) {
  const income = item.type === "income";
  return `<article class="card">
    <div class="spread"><span class="legend-name">${iconBadge(item.category_id)}<strong>${esc(categoryName(item.category_id))}</strong></span><span class="money ${income ? "ok" : "bad"}">${income ? "" : "−"}${money(item.amount)}</span></div>
    <p class="small muted">${esc(formatLong(item.date))} · ${income ? "Доход" : "Расход"}</p>
    ${item.note ? `<p style="margin-top:0.45rem;white-space:pre-wrap">${esc(item.note)}</p>` : ""}
    ${withActions ? `<div class="row-actions">
      <button class="btn btn-ghost slim" type="button" data-action="edit-tx" data-id="${esc(item.id)}">Изменить</button>
      <button class="btn btn-danger slim" type="button" data-action="delete-tx" data-id="${esc(item.id)}">Удалить</button>
    </div>` : ""}
  </article>`;
}

function txScreen() {
  const draft = txDraft();
  if (!draft) return `<p class="note note-bad">Запись не найдена.</p>`;
  const cats = categoriesOf(draft.type);
  return `<form id="tx-form" class="stack" autocomplete="off">
    ${errorBox()}
    <div class="seg" role="group" aria-label="Тип записи">
      <button class="${draft.type === "expense" ? "on" : ""}" type="button" data-action="set-type" data-type="expense">Расход</button>
      <button class="${draft.type === "income" ? "on" : ""}" type="button" data-action="set-type" data-type="income">Доход</button>
    </div>
    <label class="label">Сумма<input class="field" name="amount" inputmode="numeric" value="${esc(draft.amount)}" placeholder="50000" required></label>
    <label class="label">Категория<select class="field" name="category_id">${options(cats, draft.category_id)}</select></label>
    <label class="label">Дата<input class="field" type="date" name="date" value="${esc(draft.date)}" max="${addYears(todayInTashkent(), 1)}" required></label>
    <label class="label">Комментарий<textarea class="field" name="note" maxlength="200" placeholder="Необязательно">${esc(draft.note)}</textarea></label>
    <button class="btn" type="submit">Сохранить</button>
    <button class="btn btn-ghost" type="button" data-action="go" data-go="${esc(returnTo)}">Отмена</button>
  </form>`;
}

function listScreen() {
  const rows = state.transactions
    .filter((item) => inRange(item.date, filters.from, filters.to))
    .filter((item) => !filters.type || item.type === filters.type)
    .filter((item) => !filters.category_id || item.category_id === filters.category_id)
    .sort(compareTx);
  const totals = summary(filters.from, filters.to);
  const shown = filters.type === "income" ? totals.income : filters.type === "expense" ? totals.expense : null;
  return `<form id="filter-form" class="card filters">
      ${errorBox()}
      <label class="label">С даты<input class="field" type="date" name="from" value="${esc(filters.from)}"></label>
      <label class="label">По дату<input class="field" type="date" name="to" value="${esc(filters.to)}"></label>
      <label class="label">Тип<select class="field" name="type">
        <option value=""${filters.type === "" ? " selected" : ""}>Все</option>
        <option value="expense"${filters.type === "expense" ? " selected" : ""}>Расходы</option>
        <option value="income"${filters.type === "income" ? " selected" : ""}>Доходы</option>
      </select></label>
      <label class="label">Категория<select class="field" name="category_id">${options(state.categories, filters.category_id, "Все")}</select></label>
      <button class="btn" type="submit">Показать</button>
    </form>
    <div class="spread">
      <p class="muted">${rows.length} ${recordsLabel(rows.length)}${shown == null ? ` · баланс ${signedMoney(totals.balance)}` : ""}</p>
      <button class="btn slim" type="button" data-action="add" data-back="list">Добавить</button>
    </div>
    ${rows.length ? rows.map((item) => txCard(item)).join("") : `<p class="card muted">Записей за выбранный период нет.</p>`}`;
}

function chartsScreen() {
  const range = periodRange(chartPeriod);
  const bars = chartPeriod === "day" ? expenseByCategory(range.from, range.to) : expenseByDay(range.from, range.to);
  const pie = expenseByCategory(range.from, range.to).filter((item) => item.amount > 0);
  const total = pie.reduce((sum, item) => sum + item.amount, 0);
  const barHeight = chartPeriod === "day" ? Math.max(180, bars.length * 36 + 16) : 240;
  const caption = chartPeriod === "day"
    ? `Расходы сегодня, ${formatLong(range.from)}`
    : chartPeriod === "week"
      ? `Расходы с ${formatLong(range.from)} по ${formatLong(range.to)}`
      : `Расходы за ${monthTitle(range.from)}`;
  return `<div class="seg seg-3" role="tablist">
      <button type="button" data-action="chart" data-period="day" class="${chartPeriod === "day" ? "on" : ""}">День</button>
      <button type="button" data-action="chart" data-period="week" class="${chartPeriod === "week" ? "on" : ""}">Неделя</button>
      <button type="button" data-action="chart" data-period="month" class="${chartPeriod === "month" ? "on" : ""}">Месяц</button>
    </div>
    <article class="card stack">
      <div class="spread"><h2>${esc(caption)}</h2><strong>${money(total)}</strong></div>
      <div class="chart-box" style="height:${barHeight}px"><canvas data-chart="bars" aria-label="${esc(caption)}"></canvas></div>
    </article>
    <article class="card stack">
      <h2>По категориям</h2>
      ${pie.length ? `<div class="chart-box" style="height:220px"><canvas data-chart="pie" aria-label="Расходы по категориям"></canvas></div>
        <div class="legend">${pie.map((item) => `<div class="legend-row"><span class="legend-name">${iconBadge(item.id)}<span>${esc(item.name)}</span></span><span>${money(item.amount)}</span></div>`).join("")}</div>` : `<p class="muted">Нет расходов за этот период.</p>`}
    </article>`;
}

function debtFormValues() {
  if (debtDraft) return debtDraft;
  const debt = state.debts.find((item) => item.id === debtEditId);
  if (debt) {
    return {
      person_name: debt.person_name,
      amount: String(debt.amount),
      date: debt.date,
      due_date: debt.due_date || "",
      note: debt.note || "",
    };
  }
  return { person_name: "", amount: "", date: todayInTashkent(), due_date: "", note: "" };
}

function debtsScreen() {
  const values = debtFormValues();
  const today = todayInTashkent();
  const rows = state.debts
    .filter((item) => item.direction === debtTab)
    .sort((a, b) => {
      if (Boolean(a.is_closed) !== Boolean(b.is_closed)) return a.is_closed ? 1 : -1;
      return a.date < b.date ? 1 : -1;
    });
  return `<div class="seg" role="tablist">
      <button type="button" data-action="debt-tab" data-direction="gave" class="${debtTab === "gave" ? "on" : ""}">Я дал</button>
      <button type="button" data-action="debt-tab" data-direction="took" class="${debtTab === "took" ? "on" : ""}">Я взял</button>
    </div>
    <form id="debt-form" class="card stack" autocomplete="off">
      <h2>${debtEditId ? "Изменить долг" : "Новый долг"}</h2>
      ${errorBox()}
      <label class="label">Имя<input class="field" name="person_name" maxlength="60" value="${esc(values.person_name)}" required></label>
      <label class="label">Сумма<input class="field" name="amount" inputmode="numeric" value="${esc(values.amount)}" required></label>
      <label class="label">Дата<input class="field" type="date" name="date" value="${esc(values.date)}" required></label>
      <label class="label">Срок возврата<input class="field" type="date" name="due_date" value="${esc(values.due_date)}"></label>
      <label class="label">Комментарий<textarea class="field" name="note" maxlength="200">${esc(values.note)}</textarea></label>
      <button class="btn" type="submit">${debtEditId ? "Сохранить" : "Добавить долг"}</button>
      ${debtEditId ? `<button class="btn btn-ghost" type="button" data-action="cancel-debt">Отмена</button>` : ""}
    </form>
    ${rows.length ? rows.map((debt) => {
      const overdue = !debt.is_closed && debt.due_date && debt.due_date < today;
      return `<article class="card ${debt.is_closed ? "closed" : ""}">
        <div class="spread"><strong>${esc(debt.person_name)}</strong><span class="money">${money(debt.amount)}</span></div>
        <p class="small muted">${esc(formatLong(debt.date))}${debt.due_date ? ` · вернуть до ${esc(formatLong(debt.due_date))}` : ""}</p>
        <p style="margin-top:0.45rem">${debt.is_closed ? `<span class="pill pill-ok">возвращён</span>` : overdue ? `<span class="pill pill-danger">просрочен</span>` : `<span class="pill pill-muted">открыт</span>`}</p>
        ${debt.note ? `<p style="margin-top:0.45rem;white-space:pre-wrap">${esc(debt.note)}</p>` : ""}
        <div class="row-actions">
          ${debt.is_closed ? "" : `<button class="btn slim" type="button" data-action="close-debt" data-id="${esc(debt.id)}">Возвращён</button>`}
          <button class="btn btn-ghost slim" type="button" data-action="edit-debt" data-id="${esc(debt.id)}">Изменить</button>
          <button class="btn btn-danger slim" type="button" data-action="delete-debt" data-id="${esc(debt.id)}">Удалить</button>
        </div>
      </article>`;
    }).join("") : `<p class="card muted">В этой вкладке долгов нет.</p>`}
    <p class="small muted">Долги не входят в доходы, расходы и баланс.</p>`;
}

function limitsScreen() {
  const draft = limitDraft || { category_id: "", amount: "" };
  const rows = limitStatuses();
  return `<form id="limit-form" class="card stack" autocomplete="off">
      <h2>Лимит на месяц</h2>
      ${errorBox()}
      <label class="label">Категория<select class="field" name="category_id">${options(categoriesOf("expense"), draft.category_id, "Общий лимит")}</select></label>
      <label class="label">Сумма<input class="field" name="amount" inputmode="numeric" value="${esc(draft.amount)}" placeholder="100000" required></label>
      <button class="btn" type="submit">Сохранить лимит</button>
    </form>
    ${rows.length ? rows.map((item) => `<article class="card stack">
      ${limitRow(item)}
      <button class="btn btn-danger" type="button" data-action="delete-limit" data-id="${esc(item.id)}">Удалить</button>
    </article>`).join("") : `<p class="card muted">Лимитов пока нет. Жёлтый сигнал появится с 80%, красный — со 100%.</p>`}`;
}

function screenBody() {
  const { screen } = route();
  if (screen === "home") return homeScreen();
  if (screen === "add" || screen === "edit") return txScreen();
  if (screen === "list") return listScreen();
  if (screen === "charts") return chartsScreen();
  if (screen === "debts") return debtsScreen();
  if (screen === "limits") return limitsScreen();
  return homeScreen();
}

function confirmBox() {
  if (!pendingConfirm) return "";
  return `<div class="modal-back"><div class="card modal" role="dialog" aria-modal="true">
    <h2>Подтверждение</h2>
    <p>${esc(pendingConfirm.text)}</p>
    <div class="row-actions">
      <button class="btn btn-ghost slim" type="button" data-action="confirm-no">Отмена</button>
      <button class="btn btn-danger slim" type="button" data-action="confirm-yes">Удалить</button>
    </div>
  </div></div>`;
}

function render() {
  applyTheme();
  const { screen } = route();
  app.innerHTML = `<div class="shell">
    ${nav()}
    <div class="main">
      <header class="top">
        <div><p class="kicker">Умный помощник</p><h1>${esc(TITLES[screen] || "Главная")}</h1></div>
        ${themeButton()}
      </header>
      <div class="screen">${screenBody()}</div>
    </div>
  </div>${confirmBox()}`;
  requestAnimationFrame(drawCharts);
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth || 320;
  const height = canvas.clientHeight || 220;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fitText(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let value = text;
  while (value.length > 1 && ctx.measureText(`${value}…`).width > max) value = value.slice(0, -1);
  return `${value}…`;
}

function drawHorizontal(canvas, labels, values) {
  const { ctx, width, height } = fitCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  if (!labels.length) return;
  const left = Math.min(148, width * 0.42);
  const max = Math.max(...values, 1);
  const rowH = (height - 8) / labels.length;
  ctx.font = "12px Segoe UI, sans-serif";
  ctx.textBaseline = "middle";
  labels.forEach((label, index) => {
    const y = 4 + rowH * index + rowH / 2;
    ctx.fillStyle = cssVar("--muted");
    ctx.textAlign = "right";
    ctx.fillText(fitText(ctx, label, left - 12), left - 8, y);
    const track = width - left - 12;
    ctx.fillStyle = cssVar("--bar");
    roundRect(ctx, left, y - 7, track, 14, 7);
    ctx.fill();
    const bar = track * (values[index] / max);
    if (bar > 0) {
      ctx.fillStyle = cssVar("--slice");
      roundRect(ctx, left, y - 7, bar, 14, 7);
      ctx.fill();
    }
  });
}

function drawVertical(canvas, labels, values) {
  const { ctx, width, height } = fitCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  const bottom = 28;
  const top = 12;
  const max = Math.max(...values, 1);
  const gap = labels.length > 16 ? 3 : 6;
  const barW = Math.max(2, (width - 16 - gap * (labels.length - 1)) / labels.length);
  ctx.font = "11px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  labels.forEach((label, index) => {
    const x = 8 + index * (barW + gap);
    const barH = ((height - top - bottom) * values[index]) / max;
    ctx.fillStyle = cssVar("--bar");
    roundRect(ctx, x, top, barW, height - top - bottom, 6);
    ctx.fill();
    if (barH > 0) {
      ctx.fillStyle = cssVar("--slice");
      roundRect(ctx, x, height - bottom - barH, barW, barH, 6);
      ctx.fill();
    }
    const show = labels.length <= 10 || index % 5 === 0 || index === labels.length - 1;
    if (show) {
      ctx.fillStyle = cssVar("--muted");
      ctx.fillText(label, x + barW / 2, height - bottom + 6);
    }
  });
}

function drawPie(canvas, rows, center) {
  const { ctx, width, height } = fitCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  const total = rows.reduce((sum, item) => sum + item.amount, 0);
  const radius = Math.min(width, height) * 0.34;
  const cx = width / 2;
  const cy = height / 2;
  const thickness = radius < 56 ? Math.max(9, radius * 0.26) : Math.max(22, radius * 0.34);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = thickness;
  ctx.stroke();
  if (!total) return;
  const gap = rows.length > 1 ? 0.06 : 0.12;
  let angle = -Math.PI / 2;
  rows.forEach((row, index) => {
    const slice = (row.amount / total) * Math.PI * 2;
    const start = angle + gap / 2;
    const end = angle + Math.max(slice - gap / 2, gap);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, end);
    ctx.strokeStyle = categoryColor(row.id, index);
    ctx.lineWidth = thickness;
    ctx.lineCap = "round";
    ctx.stroke();
    angle += slice;
  });
  if (!center) return;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = cssVar("--muted");
  ctx.font = "600 13px Segoe UI, sans-serif";
  ctx.fillText(center.caption, cx, cy - 12);
  ctx.fillStyle = cssVar("--ink");
  ctx.font = "700 18px Segoe UI, sans-serif";
  ctx.fillText(center.value, cx, cy + 12);
}

function drawCharts() {
  const home = document.querySelector("canvas[data-chart='home']");
  if (home) {
    const bounds = monthBounds(todayInTashkent());
    const homeRows = expenseByCategory(bounds.from, bounds.to).filter((item) => item.amount > 0);
    const homeTotal = homeRows.reduce((sum, item) => sum + item.amount, 0);
    drawPie(home, homeRows, { caption: "за месяц", value: money(homeTotal).replace(" сум", "") });
  }
  const bars = document.querySelector("canvas[data-chart='bars']");
  const pie = document.querySelector("canvas[data-chart='pie']");
  if (!bars) return;
  const range = periodRange(chartPeriod);
  if (chartPeriod === "day") {
    const rows = expenseByCategory(range.from, range.to);
    drawHorizontal(bars, rows.map((item) => item.name), rows.map((item) => item.amount));
  } else {
    const rows = expenseByDay(range.from, range.to);
    const labels = rows.map((item) => chartPeriod === "week"
      ? `${WEEKDAYS[dateParts(item.date).weekday]} ${dateParts(item.date).day}`
      : String(dateParts(item.date).day));
    drawVertical(bars, labels, rows.map((item) => item.amount));
  }
  if (pie) drawPie(pie, expenseByCategory(range.from, range.to).filter((item) => item.amount > 0));
}

function startAdd(back) {
  returnTo = back || "home";
  draftTx = {
    id: "",
    type: "expense",
    amount: "",
    category_id: categoriesOf("expense")[0].id,
    date: todayInTashkent(),
    note: "",
  };
  go("add");
}

function startEdit(id) {
  const found = state.transactions.find((item) => item.id === id);
  if (!found) return;
  returnTo = route().screen === "home" ? "home" : "list";
  draftTx = {
    id: found.id,
    type: found.type,
    amount: String(found.amount),
    category_id: found.category_id,
    date: found.date,
    note: found.note || "",
  };
  go("edit", id);
}

function saveTx(form) {
  const data = Object.fromEntries(new FormData(form));
  const type = draftTx?.type === "income" ? "income" : "expense";
  const amount = parseAmount(data.amount);
  const category = state.categories.find((item) => item.id === data.category_id);
  draftTx = { id: draftTx?.id || "", type, amount: data.amount, category_id: data.category_id, date: data.date, note: data.note || "" };
  if (amount == null) return fail("Сумма должна быть целым числом от 1 до 999 999 999 999.");
  if (!category || category.type !== type) return fail("Категория не совпадает с типом записи.");
  if (!isIsoDate(data.date)) return fail("Дата должна быть в формате ГГГГ-ММ-ДД.");
  if (data.date > addYears(todayInTashkent(), 1)) return fail("Дата не может быть позже чем через год.");
  const note = (data.note || "").trim();
  if (note.length > 200) return fail("Комментарий длиннее 200 символов.");
  if (draftTx.id) {
    const existing = state.transactions.find((item) => item.id === draftTx.id);
    if (!existing) return fail("Запись не найдена.");
    Object.assign(existing, { type, amount, category_id: category.id, date: data.date, note });
  } else {
    state.transactions.push({
      id: uid(),
      type,
      amount,
      category_id: category.id,
      date: data.date,
      note,
      created_at: new Date().toISOString(),
    });
  }
  formError = "";
  draftTx = null;
  const dest = returnTo;
  localStorage.setItem(KEY, JSON.stringify(state));
  go(dest);
}

function applyFilters(form) {
  const data = Object.fromEntries(new FormData(form));
  if ((data.from && !isIsoDate(data.from)) || (data.to && !isIsoDate(data.to))) return fail("Проверьте даты периода.");
  if (data.from && data.to && data.from > data.to) return fail("Дата начала позже даты конца.");
  filters = { from: data.from || "", to: data.to || "", type: data.type || "", category_id: data.category_id || "" };
  formError = "";
  render();
}

function saveDebt(form) {
  const data = Object.fromEntries(new FormData(form));
  const person = (data.person_name || "").trim();
  const amount = parseAmount(data.amount);
  const note = (data.note || "").trim();
  debtDraft = { person_name: data.person_name || "", amount: data.amount || "", date: data.date || "", due_date: data.due_date || "", note: data.note || "" };
  if (!person) return fail("Введите имя.");
  if (person.length > 60) return fail("Имя длиннее 60 символов.");
  if (amount == null) return fail("Сумма должна быть целым числом от 1 до 999 999 999 999.");
  if (!isIsoDate(data.date)) return fail("Укажите дату долга.");
  if (data.due_date && !isIsoDate(data.due_date)) return fail("Срок возврата указан неверно.");
  if (note.length > 200) return fail("Комментарий длиннее 200 символов.");
  const direction = debtTab === "took" ? "took" : "gave";
  if (debtEditId) {
    const debt = state.debts.find((item) => item.id === debtEditId);
    if (!debt) return fail("Долг не найден.");
    Object.assign(debt, { direction, person_name: person, amount, date: data.date, due_date: data.due_date || "", note });
  } else {
    state.debts.push({
      id: uid(),
      direction,
      person_name: person,
      amount,
      date: data.date,
      due_date: data.due_date || "",
      note,
      is_closed: false,
    });
  }
  debtEditId = "";
  debtDraft = null;
  formError = "";
  persist();
}

function saveLimit(form) {
  const data = Object.fromEntries(new FormData(form));
  const amount = parseAmount(data.amount);
  const categoryId = data.category_id || "";
  limitDraft = { category_id: categoryId, amount: data.amount || "" };
  if (amount == null) return fail("Сумма должна быть целым числом от 1 до 999 999 999 999.");
  if (categoryId && !categoriesOf("expense").some((item) => item.id === categoryId)) return fail("Выберите категорию расходов.");
  const existing = state.limits.find((item) => (item.category_id || "") === categoryId);
  if (existing) existing.amount = amount;
  else state.limits.push({ id: uid(), category_id: categoryId || null, amount });
  limitDraft = null;
  formError = "";
  persist();
}

function fail(message) {
  formError = message;
  render();
}

function askDelete(kind, id, text) {
  pendingConfirm = { kind, id, text };
  render();
}

function confirmDelete() {
  if (!pendingConfirm) return;
  if (pendingConfirm.kind === "tx") state.transactions = state.transactions.filter((item) => item.id !== pendingConfirm.id);
  if (pendingConfirm.kind === "debt") state.debts = state.debts.filter((item) => item.id !== pendingConfirm.id);
  if (pendingConfirm.kind === "limit") state.limits = state.limits.filter((item) => item.id !== pendingConfirm.id);
  pendingConfirm = null;
  persist();
}

function onClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button || !app.contains(button)) return;
  const action = button.dataset.action;
  const id = button.dataset.id || "";
  if (action === "toggle-theme") {
    state.theme = state.theme === "dark" ? "light" : "dark";
    persist();
    return;
  }
  if (action === "go") {
    debtDraft = null;
    if (button.dataset.go !== "debts") debtEditId = "";
    go(button.dataset.go);
    return;
  }
  if (action === "add") {
    startAdd(button.dataset.back || "home");
    return;
  }
  if (action === "edit-tx") {
    startEdit(id);
    return;
  }
  if (action === "delete-tx") {
    const item = state.transactions.find((row) => row.id === id);
    if (!item) return;
    askDelete("tx", id, `Удалить ${item.type === "income" ? "доход" : "расход"} ${money(item.amount)}?`);
    return;
  }
  if (action === "set-type") {
    const form = document.getElementById("tx-form");
    if (!form) return;
    const data = Object.fromEntries(new FormData(form));
    const type = button.dataset.type === "income" ? "income" : "expense";
    const cats = categoriesOf(type);
    const categoryId = cats.some((item) => item.id === data.category_id) ? data.category_id : cats[0].id;
    draftTx = { id: draftTx?.id || "", type, amount: data.amount || "", category_id: categoryId, date: data.date || todayInTashkent(), note: data.note || "" };
    formError = "";
    render();
    return;
  }
  if (action === "chart") {
    chartPeriod = button.dataset.period || "month";
    render();
    return;
  }
  if (action === "debt-tab") {
    debtTab = button.dataset.direction === "took" ? "took" : "gave";
    debtEditId = "";
    debtDraft = null;
    formError = "";
    render();
    return;
  }
  if (action === "edit-debt") {
    const debt = state.debts.find((item) => item.id === id);
    if (!debt) return;
    debtTab = debt.direction;
    debtEditId = debt.id;
    debtDraft = null;
    formError = "";
    render();
    return;
  }
  if (action === "cancel-debt") {
    debtEditId = "";
    debtDraft = null;
    formError = "";
    render();
    return;
  }
  if (action === "close-debt") {
    const debt = state.debts.find((item) => item.id === id);
    if (!debt) return;
    debt.is_closed = true;
    persist();
    return;
  }
  if (action === "delete-debt") {
    const debt = state.debts.find((item) => item.id === id);
    if (!debt) return;
    askDelete("debt", id, `Удалить долг «${debt.person_name}»?`);
    return;
  }
  if (action === "delete-limit") {
    const limit = state.limits.find((item) => item.id === id);
    if (!limit) return;
    const name = limit.category_id ? categoryName(limit.category_id) : "Общий";
    askDelete("limit", id, `Удалить лимит «${name}»?`);
    return;
  }
  if (action === "confirm-yes") confirmDelete();
  if (action === "confirm-no") {
    pendingConfirm = null;
    render();
  }
}

function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  if (form.id === "tx-form") saveTx(form);
  if (form.id === "filter-form") applyFilters(form);
  if (form.id === "debt-form") saveDebt(form);
  if (form.id === "limit-form") saveLimit(form);
}

app.addEventListener("click", onClick);
app.addEventListener("submit", onSubmit);
window.addEventListener("hashchange", render);
window.addEventListener("resize", () => {
  if (document.querySelector("canvas[data-chart]")) drawCharts();
});

if (!location.hash) location.hash = "#/home";
else render();
