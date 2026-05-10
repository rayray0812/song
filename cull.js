const SCHEDULE_STORAGE_KEY = "cullScheduleByEval";
const CHAT_AUTHOR_STORAGE_KEY = "cullChatAuthor";
const ACTIVE_TAB_STORAGE_KEY = "cullActiveTab";
const DEFAULT_DURATION_MIN = 5;
// One-time cleanup of legacy ephemeral keys (broadcast-era).
const LEGACY_CLEANUP_FLAG = "cullLegacyCleaned_v1";
if (!localStorage.getItem(LEGACY_CLEANUP_FLAG)) {
  localStorage.removeItem("cullLiveSession");
  localStorage.removeItem("cullChatLog");
  localStorage.setItem(LEGACY_CLEANUP_FLAG, "1");
}

const state = {
  songs: [],
  db: null,
  isUnlocked: false,
  channel: null,
  passphrase: "",
  schedule: loadStoredSchedule(),
  isScheduleCloudReady: false,
  scheduleSaveTimer: null,
  live: defaultLiveSession(),
  author: localStorage.getItem(CHAT_AUTHOR_STORAGE_KEY) ?? "",
  chat: {},
  notesChannel: null,
  liveTickInterval: null,
};


const gatePanel = document.querySelector("#gatePanel");
const gateForm = document.querySelector("#gateForm");
const gateStatus = document.querySelector("#gateStatus");
const passphraseInput = document.querySelector("#passphraseInput");
const cullPanels = document.querySelectorAll(".cull-panel");
const cullList = document.querySelector("#cullList");
const cullStats = document.querySelector("#cullStats");
const cullCount = document.querySelector("#cullCount");
const syncStatus = document.querySelector("#syncStatus");
const copyPassedButton = document.querySelector("#copyPassedButton");
const copyScheduleButton = document.querySelector("#copyScheduleButton");
const scheduleStartInput = document.querySelector("#scheduleStart");
const scheduleList = document.querySelector("#scheduleList");
const cullTabButtons = document.querySelectorAll(".cull-tab-button");
const cullSections = document.querySelectorAll("[data-cull-section]");
const enterLiveModeButton = document.querySelector("#enterLiveModeButton");
const exitLiveModeButton = document.querySelector("#exitLiveModeButton");
const liveMode = document.querySelector("#liveMode");
const liveEvalTag = document.querySelector("#liveEvalTag");
const liveClock = document.querySelector("#liveClock");
const liveCurrentTitle = document.querySelector("#liveCurrentTitle");
const liveCurrentPeople = document.querySelector("#liveCurrentPeople");
const liveSongTimer = document.querySelector("#liveSongTimer");
const liveSongRemaining = document.querySelector("#liveSongRemaining");
const liveStartButton = document.querySelector("#liveStartButton");
const liveDelay = document.querySelector("#liveDelay");
const liveNextTitle = document.querySelector("#liveNextTitle");
const liveChatMessages = document.querySelector("#liveChatMessages");
const liveAuthorInput = document.querySelector("#liveAuthorInput");
const liveChatForm = document.querySelector("#liveChatForm");
const liveChatInput = document.querySelector("#liveChatInput");
const liveNextButton = document.querySelector("#liveNextButton");
const livePrevButton = document.querySelector("#livePrevButton");

scheduleStartInput.value = state.schedule.start;
liveAuthorInput.value = state.author;

function setActiveCullTab(tab) {
  const valid = new Set(["cull", "schedule", "stats"]);
  const next = valid.has(tab) ? tab : "cull";
  localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, next);
  cullTabButtons.forEach((button) => {
    const isActive = button.dataset.cullTab === next;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  cullSections.forEach((section) => {
    section.classList.toggle("is-tab-hidden", section.dataset.cullSection !== next);
  });
}

setActiveCullTab(localStorage.getItem(ACTIVE_TAB_STORAGE_KEY) ?? "cull");

cullTabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveCullTab(button.dataset.cullTab));
});

function createCloudClient() {
  const config = window.SUPABASE_CONFIG;
  if (!config?.url || !config?.anonKey || !window.supabase) return null;
  return window.supabase.createClient(config.url, config.anonKey);
}

async function unlock(passphrase) {
  state.db = createCloudClient();
  if (!state.db) {
    gateStatus.textContent = "尚未設定 Supabase，無法使用刷歌功能。";
    return;
  }

  gateStatus.textContent = "檢查密語中...";
  const { data: isValid, error } = await state.db.rpc("verify_cull_passphrase", {
    input_passphrase: passphrase,
  });

  if (error) {
    gateStatus.textContent = "驗證失敗，請檢查資料庫設定。";
    return;
  }

  if (!isValid) {
    gateStatus.textContent = "密語不正確。";
    return;
  }

  state.isUnlocked = true;
  state.passphrase = passphrase;
  gatePanel.hidden = true;
  cullPanels.forEach((panel) => panel.classList.remove("is-locked"));
  document.querySelector("#cullTabs").classList.remove("is-locked");
  await loadCloudSchedule();
  await loadSongs();
  await loadCullNotes();
  subscribeToSongs();
  subscribeToCullNotes();
}

async function loadSongs() {
  syncStatus.textContent = "載入中...";
  const { data, error } = await state.db.from("songs").select("*").order("created_at", { ascending: false });

  if (error) {
    syncStatus.textContent = "載入失敗，請檢查資料庫設定。";
    return;
  }

  state.songs = data ?? [];
  syncStatus.textContent = "已連線，即時同步中";
  render();
}

function subscribeToSongs() {
  if (state.channel) return;

  state.channel = state.db
    .channel("cull-song-updates")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "songs" },
      () => {
        loadSongs();
      },
    )
    .subscribe((status) => {
      syncStatus.textContent = status === "SUBSCRIBED" ? "已連線，即時同步中" : "正在同步...";
    });
}

function render() {
  renderSongs();
  renderStats();
  renderSchedule();
}

function renderSongs() {
  const passedCount = state.songs.filter((song) => !song.is_eliminated).length;
  cullCount.textContent = `${passedCount} / ${state.songs.length} 通過`;

  if (state.songs.length === 0) {
    cullList.innerHTML = `<div class="empty-state">目前沒有歌曲</div>`;
    return;
  }

  const sortedSongs = [...state.songs].sort((a, b) => Number(a.is_eliminated) - Number(b.is_eliminated));

  cullList.replaceChildren(
    ...sortedSongs.map((song) => {
      const item = document.createElement("article");
      item.className = `cull-song${song.is_eliminated ? " is-eliminated" : ""}`;
      item.dataset.songId = song.id;
      const people = Object.entries(song.performers ?? {})
        .map(([role, name]) => `<span><strong>${escapeHtml(role)}</strong> ${escapeHtml(name)}</span>`)
        .join("");

      item.innerHTML = `
        <label class="cull-toggle">
          <input type="checkbox" data-id="${song.id}" ${song.is_eliminated ? "checked" : ""} />
          <span>刷掉</span>
        </label>
        <div class="cull-song-body">
          <h3>${escapeHtml(song.title)}</h3>
          <div class="cull-people">${people || "未填人員"}</div>
          ${renderSongNotesHtml(state.chat[song.id] ?? [])}
        </div>
      `;
      return item;
    }),
  );
}

function renderSongNotesHtml(notes) {
  if (!notes || notes.length === 0) return "";
  const items = notes
    .map(
      (n) => `<li><span class="cull-note-author">${escapeHtml(n.author || "匿名")}</span><span class="cull-note-content">${escapeHtml(n.content)}</span><button class="cull-note-delete" type="button" data-note-id="${n.id}" aria-label="刪除評語">×</button></li>`,
    )
    .join("");
  return `
    <details class="cull-song-notes">
      <summary>💬 ${notes.length} 則評語</summary>
      <ul>${items}</ul>
    </details>
  `;
}

function updateSongNotesUI(songId) {
  const songEl = cullList.querySelector(`.cull-song[data-song-id="${songId}"]`);
  if (!songEl) return;
  const body = songEl.querySelector(".cull-song-body");
  if (!body) return;
  const existing = body.querySelector(".cull-song-notes");
  const wasOpen = existing?.open === true;
  const html = renderSongNotesHtml(state.chat[songId] ?? []);
  if (existing) existing.remove();
  if (html) {
    body.insertAdjacentHTML("beforeend", html);
    if (wasOpen) body.querySelector(".cull-song-notes")?.setAttribute("open", "");
  }
}

function refreshNotesInCullList() {
  cullList.querySelectorAll(".cull-song[data-song-id]").forEach((songEl) => {
    updateSongNotesUI(songEl.dataset.songId);
  });
}

function defaultScheduleState() {
  return { start: "", durations: {}, order: [] };
}

function normalizeSchedule(value) {
  const fallback = defaultScheduleState();
  if (!value || typeof value !== "object") return fallback;
  const source = value.start !== undefined ? value : value["1"];
  if (!source || typeof source !== "object") return fallback;
  if (typeof source.start === "string") fallback.start = source.start;
  if (source.durations && typeof source.durations === "object" && !Array.isArray(source.durations)) {
    fallback.durations = { ...source.durations };
  }
  if (Array.isArray(source.order)) {
    fallback.order = source.order.filter((id) => typeof id === "string");
  }
  return fallback;
}

function scheduleHasData(schedule) {
  return Boolean(
    schedule?.start ||
      Object.keys(schedule?.durations ?? {}).length > 0 ||
      (Array.isArray(schedule?.order) && schedule.order.length > 0),
  );
}

function loadStoredSchedule() {
  try {
    const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY);
    if (!raw) return defaultScheduleState();
    return normalizeSchedule(JSON.parse(raw));
  } catch {}
  return defaultScheduleState();
}

function persistSchedule() {
  localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(state.schedule));
  queueCloudScheduleSave();
}

async function loadCloudSchedule() {
  if (!state.db || !state.passphrase) return;
  const localSchedule = state.schedule;
  const { data, error } = await state.db.rpc("get_cull_schedule", {
    input_passphrase: state.passphrase,
  });
  if (error || !data) {
    state.isScheduleCloudReady = !error;
    return;
  }
  const cloudSchedule = normalizeSchedule(data);
  if (!scheduleHasData(cloudSchedule) && scheduleHasData(localSchedule)) {
    state.schedule = localSchedule;
    state.isScheduleCloudReady = true;
    saveCloudSchedule();
    return;
  }
  state.schedule = cloudSchedule;
  state.isScheduleCloudReady = true;
  localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(state.schedule));
  scheduleStartInput.value = state.schedule.start;
}

function queueCloudScheduleSave() {
  if (!state.db || !state.passphrase) return;
  clearTimeout(state.scheduleSaveTimer);
  state.scheduleSaveTimer = setTimeout(saveCloudSchedule, 350);
}

async function saveCloudSchedule() {
  if (!state.db || !state.passphrase) return;
  const { data, error } = await state.db.rpc("set_cull_schedule", {
    input_passphrase: state.passphrase,
    schedule_data: state.schedule,
  });
  if (error || data !== true) {
    console.warn("Unable to sync schedule", error);
    state.isScheduleCloudReady = false;
    return;
  }
  state.isScheduleCloudReady = true;
}

function defaultLiveSession() {
  return { active: false, songIndex: 0, evalStartedAt: null, songStartedAt: null };
}

function parseTimeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatMinutes(total) {
  const rounded = Math.round(total);
  const wrapped = ((rounded % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function getScheduledSongs() {
  const passing = state.songs.filter((song) => !song.is_eliminated);
  const byId = new Map(passing.map((song) => [song.id, song]));
  const ordered = [];
  const seen = new Set();
  (state.schedule.order ?? []).forEach((id) => {
    const song = byId.get(id);
    if (song && !seen.has(id)) {
      ordered.push(song);
      seen.add(id);
    }
  });
  const rest = passing
    .filter((song) => !seen.has(song.id))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  return [...ordered, ...rest];
}

function getDurationFor(songId) {
  const stored = state.schedule.durations[songId];
  const num = Number(stored);
  if (!Number.isFinite(num) || num < 0) return DEFAULT_DURATION_MIN;
  return num;
}

function computeScheduleRows() {
  const startMin = parseTimeToMinutes(state.schedule.start);
  const songs = getScheduledSongs();
  let cursor = startMin;
  return songs.map((song) => {
    const duration = getDurationFor(song.id);
    const slotStart = cursor;
    const slotEnd = cursor === null ? null : cursor + duration;
    if (cursor !== null) cursor = slotEnd;
    return { song, duration, slotStart, slotEnd };
  });
}

function renderSchedule() {
  scheduleStartInput.value = state.schedule.start;

  const rows = computeScheduleRows();
  if (rows.length === 0) {
    scheduleList.innerHTML = `<div class="empty-state">沒有要評鑑的歌（請先在下方刷歌）。</div>`;
    updateCopyButton();
    return;
  }

  scheduleList.replaceChildren(
    ...rows.map(({ song, duration, slotStart, slotEnd }) => {
      const row = document.createElement("div");
      row.className = "schedule-row";
      row.dataset.songId = song.id;
      const slotText = slotStart === null
        ? "—"
        : `${formatMinutes(slotStart)}-${formatMinutes(slotEnd)}`;
      row.innerHTML = `
        <button class="schedule-drag-handle" type="button" aria-label="拖曳調整順序" data-song-id="${song.id}">☰</button>
        <span class="schedule-slot">${slotText}</span>
        <label class="schedule-duration">
          <input type="number" min="0" step="1" inputmode="numeric"
            value="${duration}" data-song-id="${song.id}" />
          <span>分</span>
        </label>
        <span class="schedule-title">${escapeHtml(song.title)}</span>
      `;
      return row;
    }),
  );

  updateCopyButton();
}

function updateScheduleSlots() {
  const rows = scheduleList.querySelectorAll(".schedule-row");
  if (rows.length === 0) {
    renderSchedule();
    return;
  }
  const computed = computeScheduleRows();
  rows.forEach((rowEl, index) => {
    const slot = rowEl.querySelector(".schedule-slot");
    const data = computed[index];
    if (!slot || !data) return;
    slot.textContent = data.slotStart === null
      ? "—"
      : `${formatMinutes(data.slotStart)}-${formatMinutes(data.slotEnd)}`;
  });
  updateCopyButton();
}

function updateCopyButton() {
  const startSet = parseTimeToMinutes(state.schedule.start) !== null;
  const hasSongs = scheduleList.querySelectorAll(".schedule-row").length > 0;
  copyScheduleButton.disabled = !startSet || !hasSongs;
  enterLiveModeButton.disabled = !startSet || !hasSongs;
}

function copyScheduledSongs() {
  const rows = computeScheduleRows();
  if (rows.length === 0 || rows[0].slotStart === null) return;
  const lines = rows.map(({ song, slotStart, slotEnd }) =>
    `${formatMinutes(slotStart)}-${formatMinutes(slotEnd)} ${song.title}`,
  );
  navigator.clipboard.writeText(lines.join("\n")).then(() => {
    copyScheduleButton.textContent = "已複製";
    setTimeout(() => {
      copyScheduleButton.textContent = "複製排程";
    }, 1200);
  });
}

let dragState = null;

function startScheduleDrag(handle, event) {
  const row = handle.closest(".schedule-row");
  if (!row) return;
  const rect = row.getBoundingClientRect();
  const offsetY = event.clientY - rect.top;
  const offsetX = event.clientX - rect.left;

  const ghost = row.cloneNode(true);
  ghost.classList.add("is-drag-ghost");
  ghost.style.position = "fixed";
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.margin = "0";
  ghost.style.zIndex = "1000";
  ghost.style.pointerEvents = "none";
  document.body.appendChild(ghost);

  row.classList.add("is-dragging");
  handle.setPointerCapture(event.pointerId);

  dragState = { row, ghost, handle, offsetX, offsetY, pointerId: event.pointerId };
}

function moveScheduleDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const { ghost, row, offsetX, offsetY } = dragState;
  ghost.style.left = `${event.clientX - offsetX}px`;
  ghost.style.top = `${event.clientY - offsetY}px`;

  const others = [...scheduleList.querySelectorAll(".schedule-row:not(.is-dragging)")];
  const pointerY = event.clientY;

  for (const other of others) {
    const otherRect = other.getBoundingClientRect();
    const mid = (otherRect.top + otherRect.bottom) / 2;
    if (pointerY < mid) {
      if (row.nextElementSibling !== other) {
        scheduleList.insertBefore(row, other);
      }
      return;
    }
  }
  // Past the last row → append
  if (row !== scheduleList.lastElementChild) {
    scheduleList.appendChild(row);
  }
}

function endScheduleDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const { row, ghost, handle } = dragState;

  ghost.remove();
  row.classList.remove("is-dragging");
  if (handle.hasPointerCapture?.(event.pointerId)) {
    handle.releasePointerCapture(event.pointerId);
  }

  const newOrder = [...scheduleList.querySelectorAll(".schedule-row")]
    .map((r) => r.dataset.songId)
    .filter(Boolean);
  state.schedule.order = newOrder;
  persistSchedule();
  updateScheduleSlots();

  dragState = null;
}

function getLiveScheduleRows() {
  return computeScheduleRows();
}

function getCurrentLiveRow() {
  return getLiveScheduleRows()[state.live.songIndex] ?? null;
}

function getCurrentLiveSongId() {
  return getCurrentLiveRow()?.song?.id ?? null;
}

function formatClock(ts) {
  const d = new Date(ts);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDurationSec(seconds) {
  const sign = seconds < 0 ? "-" : "";
  const abs = Math.abs(Math.floor(seconds));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${m}:${String(s).padStart(2, "0")}`;
}

function enterLiveMode() {
  const rows = getLiveScheduleRows();
  if (rows.length === 0) return;
  if (parseTimeToMinutes(state.schedule.start) === null) {
    alert("請先設定開始時間。");
    return;
  }
  const now = Date.now();
  state.live = {
    active: true,
    songIndex: 0,
    evalStartedAt: now,
    songStartedAt: null,
  };
  showLiveMode();
}

function exitLiveMode() {
  state.live = defaultLiveSession();
  hideLiveMode();
}

function showLiveMode() {
  liveMode.hidden = false;
  document.body.classList.add("live-mode-open");
  startLiveTick();
  renderLiveMode();
  setTimeout(() => {
    const target = state.author.trim() ? liveChatInput : liveAuthorInput;
    target?.focus({ preventScroll: true });
  }, 80);
}

function hideLiveMode() {
  liveMode.hidden = true;
  document.body.classList.remove("live-mode-open");
  stopLiveTick();
}

function nextLiveSong() {
  const rows = getLiveScheduleRows();
  if (state.live.songIndex >= rows.length) return;
  animateSongChange(() => {
    state.live.songIndex += 1;
    state.live.songStartedAt = null;
  });
}

function prevLiveSong() {
  if (state.live.songIndex <= 0) return;
  animateSongChange(() => {
    state.live.songIndex -= 1;
    state.live.songStartedAt = null;
  });
}

function animateSongChange(mutate) {
  liveCurrentTitle.classList.add("is-changing");
  setTimeout(() => {
    mutate();
    renderLiveMode();
    requestAnimationFrame(() => liveCurrentTitle.classList.remove("is-changing"));
  }, 180);
}

function startCurrentSong() {
  if (!state.live.active) return;
  if (!getCurrentLiveRow()) return;
  state.live.songStartedAt = Date.now();
  renderLiveMode();
}

function computeDelaySeconds(now) {
  const startMin = parseTimeToMinutes(state.schedule.start);
  if (startMin === null) return null;
  const today = new Date(now);
  today.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
  const scheduleStartMs = today.getTime();
  const clockElapsedSec = (now - scheduleStartMs) / 1000;

  const rows = getLiveScheduleRows();
  let programPositionSec = 0;
  for (let i = 0; i < state.live.songIndex && i < rows.length; i++) {
    programPositionSec += rows[i].duration * 60;
  }
  if (state.live.songStartedAt && state.live.songIndex < rows.length) {
    programPositionSec += Math.max(0, (now - state.live.songStartedAt) / 1000);
  }

  return Math.floor(clockElapsedSec - programPositionSec);
}

function formatDelaySec(seconds) {
  if (seconds === null) return "—";
  const sign = seconds > 0 ? "+" : seconds < 0 ? "-" : "±";
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${m}:${String(s).padStart(2, "0")}`;
}

function startLiveTick() {
  stopLiveTick();
  state.liveTickInterval = setInterval(updateLiveTimers, 1000);
  updateLiveTimers();
}

function stopLiveTick() {
  if (state.liveTickInterval) {
    clearInterval(state.liveTickInterval);
    state.liveTickInterval = null;
  }
}

function updateLiveTimers() {
  if (!state.live.active) return;
  const now = Date.now();
  liveClock.textContent = formatClock(now);

  const current = getCurrentLiveRow();
  const pending = current && state.live.songStartedAt === null;
  liveSongTimer.classList.toggle("is-pending", !!pending);

  if (!current) {
    liveSongRemaining.textContent = "完";
    liveSongRemaining.classList.remove("is-overtime");
  } else if (pending) {
    liveSongRemaining.textContent = formatDurationSec(current.duration * 60);
    liveSongRemaining.classList.remove("is-overtime");
  } else {
    const songElapsed = Math.floor((now - state.live.songStartedAt) / 1000);
    const remaining = current.duration * 60 - songElapsed;
    liveSongRemaining.textContent = formatDurationSec(remaining);
    liveSongRemaining.classList.toggle("is-overtime", remaining < 0);
  }

  const delaySec = computeDelaySeconds(now);
  liveDelay.textContent = formatDelaySec(delaySec);
  liveDelay.classList.toggle("is-overtime", delaySec !== null && delaySec > 30);
  liveDelay.classList.toggle("is-ahead", delaySec !== null && delaySec < -30);
}

function renderLiveMode() {
  if (!state.live.active) return;
  const rows = getLiveScheduleRows();
  const current = rows[state.live.songIndex] ?? null;
  const next = rows[state.live.songIndex + 1] ?? null;

  const remaining = Math.max(0, rows.length - state.live.songIndex);
  liveEvalTag.textContent = remaining > 0 ? `剩 ${remaining} 首` : "已完成";

  if (current) {
    liveCurrentTitle.textContent = current.song.title;
    const people = Object.entries(current.song.performers ?? {})
      .map(([role, name]) => `<span><strong>${escapeHtml(role)}</strong> ${escapeHtml(name)}</span>`)
      .join("");
    liveCurrentPeople.innerHTML = people || `<span class="live-people-empty">未填人員</span>`;
    liveNextButton.disabled = false;
    liveNextButton.textContent = next ? "下一首 ▶" : "結束評鑑 ▶";
  } else {
    liveCurrentTitle.textContent = "評鑑結束";
    liveCurrentPeople.innerHTML = "";
    liveNextButton.disabled = true;
  }

  livePrevButton.disabled = state.live.songIndex <= 0;

  liveNextTitle.textContent = next ? next.song.title : "—";

  renderChat();
  updateLiveTimers();
}

function renderChat() {
  const songId = getCurrentLiveSongId();
  const messages = songId ? state.chat[songId] ?? [] : [];
  if (messages.length === 0) {
    liveChatMessages.innerHTML = `<div class="live-chat-empty">還沒有評語，第一個來留</div>`;
    return;
  }
  liveChatMessages.replaceChildren(
    ...messages.map((msg) => {
      const div = document.createElement("div");
      const isSelf = state.author && msg.author === state.author;
      div.className = `live-chat-msg${isSelf ? " is-self" : ""}`;
      div.innerHTML = `
        <div class="live-chat-author">${escapeHtml(msg.author || "匿名")}</div>
        <div class="live-chat-row">
          <div class="live-chat-bubble">${escapeHtml(msg.content)}</div>
          <button class="live-chat-delete" type="button" data-note-id="${msg.id}" aria-label="刪除評語">×</button>
        </div>
      `;
      return div;
    }),
  );
  liveChatMessages.scrollTop = liveChatMessages.scrollHeight;
}

function noteFromRow(row) {
  return {
    id: row.id,
    song_id: row.song_id,
    author: row.author ?? "",
    content: row.content ?? "",
    ts: new Date(row.created_at).getTime(),
  };
}

async function loadCullNotes() {
  if (!state.db) return;
  const { data, error } = await state.db
    .from("cull_notes")
    .select("*")
    .order("created_at", { ascending: true });
  if (error || !data) return;
  state.chat = {};
  data.forEach((row) => {
    const note = noteFromRow(row);
    if (!state.chat[note.song_id]) state.chat[note.song_id] = [];
    state.chat[note.song_id].push(note);
  });
  if (state.live.active) renderChat();
  refreshNotesInCullList();
}

function subscribeToCullNotes() {
  if (state.notesChannel || !state.db) return;
  state.notesChannel = state.db
    .channel("cull-notes-updates")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "cull_notes" },
      ({ new: row }) => {
        if (!row?.song_id) return;
        addChatMessage(row.song_id, noteFromRow(row));
      },
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "cull_notes" },
      ({ old }) => {
        if (old?.id) removeChatMessageById(old.id);
      },
    )
    .subscribe();
}

function removeChatMessageById(noteId) {
  for (const songId of Object.keys(state.chat)) {
    const idx = state.chat[songId].findIndex((m) => m.id === noteId);
    if (idx === -1) continue;
    state.chat[songId].splice(idx, 1);
    if (state.live.active && getCurrentLiveSongId() === songId) renderChat();
    updateSongNotesUI(songId);
    return;
  }
}

async function deleteNote(noteId) {
  if (!noteId || !state.db) return;
  if (!confirm("刪除這則評語？")) return;
  removeChatMessageById(noteId);
  const { data, error } = await state.db.rpc("delete_cull_note", {
    input_passphrase: state.passphrase,
    note_id: noteId,
  });
  if (error) {
    console.error("delete_cull_note error", error);
    alert(`刪除失敗：${error.message}\n\n（如果寫「function ... does not exist」表示 supabase-schema.sql 需要重跑）`);
    await loadCullNotes();
    return;
  }
  if (data !== true) {
    alert("刪除失敗：密語不正確或評語已被刪除。");
    await loadCullNotes();
  }
}

function addChatMessage(songId, msg) {
  if (!state.chat[songId]) state.chat[songId] = [];
  if (msg.id && state.chat[songId].some((m) => m.id === msg.id)) return;
  state.chat[songId].push(msg);
  state.chat[songId].sort((a, b) => a.ts - b.ts);
  if (state.live.active && getCurrentLiveSongId() === songId) {
    renderChat();
  }
  updateSongNotesUI(songId);
}

async function sendChatMessage(content) {
  const trimmed = content.trim();
  if (!trimmed) return false;
  if (!state.author.trim()) {
    alert("請先在上面輸入你的名字。");
    liveAuthorInput.focus();
    return false;
  }
  const songId = getCurrentLiveSongId();
  if (!songId) return false;
  if (!state.db) return false;

  const { data, error } = await state.db.rpc("add_cull_note", {
    input_passphrase: state.passphrase,
    song_id: songId,
    author: state.author.trim(),
    content: trimmed,
  });

  if (error || !data) {
    alert("傳送失敗，請稍後再試。");
    return false;
  }

  addChatMessage(songId, noteFromRow(data));
  return true;
}

function renderStats() {
  const stats = new Map();

  state.songs.forEach((song) => {
    uniqueNames(Object.values(song.performers ?? {})).forEach((name) => {
      const current = stats.get(name) ?? { name, remaining: 0, eliminated: 0 };
      if (song.is_eliminated) {
        current.eliminated += 1;
      } else {
        current.remaining += 1;
      }
      stats.set(name, current);
    });
  });

  const rows = [...stats.values()].sort((a, b) => b.remaining - a.remaining || b.eliminated - a.eliminated || a.name.localeCompare(b.name, "zh-Hant"));

  if (rows.length === 0) {
    cullStats.innerHTML = `<div class="empty-state">尚無人員統計</div>`;
    return;
  }

  cullStats.replaceChildren(
    ...rows.map((person) => {
      const row = document.createElement("div");
      row.className = "cull-stat-row";
      row.innerHTML = `
        <strong>${escapeHtml(person.name)}</strong>
        <span>剩 ${person.remaining} 首</span>
        <span>刷 ${person.eliminated} 首</span>
      `;
      return row;
    }),
  );
}

async function toggleSong(songId, isEliminated) {
  const previousSongs = state.songs;
  state.songs = state.songs.map((song) =>
    song.id === songId
      ? { ...song, is_eliminated: isEliminated, eliminated_at: isEliminated ? new Date().toISOString() : null }
      : song,
  );
  render();

  if (!state.db) return;

  const { data: ok, error } = await state.db.rpc("set_song_eliminated", {
    input_passphrase: state.passphrase,
    song_id: songId,
    eliminated: isEliminated,
  });

  if (error || !ok) {
    state.songs = previousSongs;
    render();
    syncStatus.textContent = "更新失敗，請稍後再試。";
  }
}

function copyPassedSongs() {
  const passedSongs = state.songs.filter((song) => !song.is_eliminated).map((song) => song.title);
  const content = ["以下是評鑑通過的歌單：", ...passedSongs].join("\n");

  navigator.clipboard.writeText(content).then(() => {
    copyPassedButton.textContent = "已複製";
    setTimeout(() => {
      copyPassedButton.textContent = "複製通過歌單";
    }, 1200);
  });
}

function uniqueNames(names) {
  return [...new Set(names.map((name) => String(name).trim()).filter(Boolean))];
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}

gateForm.addEventListener("submit", (event) => {
  event.preventDefault();
  unlock(passphraseInput.value);
});

cullList.addEventListener("change", (event) => {
  const input = event.target.closest("input[type='checkbox'][data-id]");
  if (!input) return;
  toggleSong(input.dataset.id, input.checked);
});

copyPassedButton.addEventListener("click", copyPassedSongs);

scheduleStartInput.addEventListener("input", () => {
  state.schedule.start = scheduleStartInput.value;
  persistSchedule();
  updateScheduleSlots();
});

scheduleList.addEventListener("input", (event) => {
  const input = event.target.closest("input[type='number'][data-song-id]");
  if (!input) return;
  const raw = input.value.trim();
  if (raw === "") return;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return;
  state.schedule.durations[input.dataset.songId] = value;
  persistSchedule();
  updateScheduleSlots();
});

scheduleList.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest(".schedule-drag-handle");
  if (!handle) return;
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault();
  startScheduleDrag(handle, event);
});

scheduleList.addEventListener("pointermove", moveScheduleDrag);
scheduleList.addEventListener("pointerup", endScheduleDrag);
scheduleList.addEventListener("pointercancel", endScheduleDrag);

copyScheduleButton.addEventListener("click", copyScheduledSongs);

enterLiveModeButton.addEventListener("click", enterLiveMode);
exitLiveModeButton.addEventListener("click", exitLiveMode);
liveNextButton.addEventListener("click", nextLiveSong);
livePrevButton.addEventListener("click", prevLiveSong);
liveStartButton.addEventListener("click", startCurrentSong);

liveAuthorInput.addEventListener("input", () => {
  state.author = liveAuthorInput.value;
  localStorage.setItem(CHAT_AUTHOR_STORAGE_KEY, state.author);
});

liveChatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (await sendChatMessage(liveChatInput.value)) {
    liveChatInput.value = "";
    liveChatInput.focus({ preventScroll: true });
  }
});

liveChatMessages.addEventListener("click", (event) => {
  const button = event.target.closest(".live-chat-delete[data-note-id]");
  if (!button) return;
  deleteNote(button.dataset.noteId);
});

cullList.addEventListener("click", (event) => {
  const button = event.target.closest(".cull-note-delete[data-note-id]");
  if (!button) return;
  event.preventDefault();
  deleteNote(button.dataset.noteId);
});
