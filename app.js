const instrumentGroups = [
  "主唱",
  "電吉他",
  "KB",
  "木吉他",
  "Bass",
  "鼓",
  "木箱鼓",
  "其他",
];

const roleIcons = {
  主唱: "mic-vocal",
  電吉他: "guitar",
  KB: "piano",
  木吉他: "guitar",
  Bass: "audio-lines",
  鼓: "drum",
  木箱鼓: "box",
  其他: "music",
};

const singlePersonRoles = new Set(["Bass", "鼓", "木箱鼓"]);

const storageKeys = {
  songs: "club-song-list:songs",
  members: "club-song-list:members",
};

const defaultMembers = ["陳小明", "陳怡君", "林家豪", "王品安", "張育瑋"];

const state = {
  songs: normalizeSongs(readJson(storageKeys.songs, [])),
  members: readJson(storageKeys.members, defaultMembers),
  editingId: null,
  db: null,
  isCloudReady: false,
  activeTab: "songs",
  statsSort: "desc",
  statsInstrument: "",
  formMode: "add",
  pendingDeleteId: null,
};

const form = document.querySelector("#songForm");
const formHost = document.querySelector("#formHost");
const editFormHost = document.querySelector("#editFormHost");
const roleFields = document.querySelector("#roleFields");
const roleGroupTemplate = document.querySelector("#roleGroupTemplate");
const personInputTemplate = document.querySelector("#personInputTemplate");
const creditInputTemplate = document.querySelector("#creditInputTemplate");
const otherInputTemplate = document.querySelector("#otherInputTemplate");
const songList = document.querySelector("#songList");
const songCount = document.querySelector("#songCount");
const statsList = document.querySelector("#statsList");
const personFilter = document.querySelector("#personFilter");
const songSearch = document.querySelector("#songSearch");
const statsSort = document.querySelector("#statsSort");
const statsInstrument = document.querySelector("#statsInstrument");
const submitButton = document.querySelector("#submitButton");
const resetButton = document.querySelector("#resetButton");
const exportButton = document.querySelector("#exportButton");
const excelExportButton = document.querySelector("#excelExportButton");
const tabButtons = document.querySelectorAll(".tab-button");
const tabViews = document.querySelectorAll(".tab-view");
const lyricsDialog = document.querySelector("#lyricsDialog");
const lyricsDialogTitle = document.querySelector("#lyricsDialogTitle");
const lyricsDialogContent = document.querySelector("#lyricsDialogContent");
const lyricsDialogClose = document.querySelector("#lyricsDialogClose");
const editDialog = document.querySelector("#editDialog");
const editDialogClose = document.querySelector("#editDialogClose");
const deleteDialog = document.querySelector("#deleteDialog");
const deleteDialogText = document.querySelector("#deleteDialogText");
const confirmDeleteButton = document.querySelector("#confirmDeleteButton");
const cancelDeleteButton = document.querySelector("#cancelDeleteButton");
const memberDialog = document.querySelector("#memberDialog");
const memberDialogTitle = document.querySelector("#memberDialogTitle");
const memberDialogClose = document.querySelector("#memberDialogClose");
const memberSearch = document.querySelector("#memberSearch");
const memberOptions = document.querySelector("#memberOptions");

let activeMemberInput = null;
let activePickerType = "performer";
let pickerTouchInput = null;
let pickerTouchStartY = 0;
let pickerTouchScrolled = false;
let memberDialogScrolled = false;

function escapeSelectorValue(value) {
  if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function createCloudClient() {
  const config = window.SUPABASE_CONFIG;
  if (!config || !config.url || !config.anonKey || !window.supabase) return null;
  return window.supabase.createClient(config.url, config.anonKey);
}

function normalizeName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ");
}

function uniqueNames(names) {
  return [...new Set((names ?? []).map(normalizeName).filter(Boolean))];
}

function normalizeSongs(songs) {
  if (!Array.isArray(songs)) return [];
  return songs.filter(Boolean).map(normalizeSong);
}

function normalizeSong(song) {
  return {
    id: song.id || crypto.randomUUID(),
    title: String(song.title ?? ""),
    arranger: normalizeName(song.arranger),
    composer: normalizeName(song.composer),
    lyricist: normalizeName(song.lyricist),
    lyrics: String(song.lyrics ?? ""),
    performers: normalizePerformers(song.performers),
    createdAt: Number(song.createdAt) || Date.now(),
    updatedAt: Number(song.updatedAt) || Date.now(),
  };
}

function normalizePerformers(performers) {
  if (!performers || typeof performers !== "object" || Array.isArray(performers)) return {};

  return Object.fromEntries(
    Object.entries(performers)
      .map(([role, name]) => [String(role), normalizeName(name)])
      .filter(([role, name]) => role && name),
  );
}

function createRoleFields() {
  instrumentGroups.forEach((role) => {
    const group = roleGroupTemplate.content.firstElementChild.cloneNode(true);
    group.dataset.role = role;
    group.querySelector("h3").innerHTML = `
      <span class="role-title">
        ${renderIcon(getRoleIcon(role), "role-icon")}
        <span>${escapeHtml(role)}</span>
      </span>
    `;
    const addButton = group.querySelector(".add-role-button");
    addButton.dataset.role = role;
    if (singlePersonRoles.has(role)) addButton.remove();
    roleFields.append(group);
    addRoleInput(role);
  });
  renderLucideIcons();
}

function createCreditFields() {
  document.querySelectorAll(".credit-group").forEach((group) => {
    group.querySelector(".credit-inputs").replaceChildren();
    addCreditInput(group.dataset.credit);
  });
}

function addCreditInput(credit, value = "") {
  const group = document.querySelector(`.credit-group[data-credit="${escapeSelectorValue(credit)}"]`);
  if (!group) return;

  const node = creditInputTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".credit-person-input").value = value;
  group.querySelector(".credit-inputs").append(node);
  updateCreditRemoveButtons(group);
}

function removeCreditInput(button) {
  const group = button.closest(".credit-group");
  const rows = group.querySelectorAll(".credit-row");
  if (rows.length <= 1) return;

  button.closest(".credit-row").remove();
  updateCreditRemoveButtons(group);
}

function updateCreditRemoveButtons(group) {
  const rows = group.querySelectorAll(".credit-row");
  rows.forEach((row) => {
    row.querySelector(".remove-credit-button").disabled = rows.length <= 1;
  });
}

function getCreditValue(credit) {
  const group = document.querySelector(`.credit-group[data-credit="${escapeSelectorValue(credit)}"]`);
  return uniqueNames([...group.querySelectorAll(".credit-person-input")].map((input) => input.value)).join("、");
}

function setCreditValue(credit, value = "") {
  const group = document.querySelector(`.credit-group[data-credit="${escapeSelectorValue(credit)}"]`);
  group.querySelector(".credit-inputs").replaceChildren();
  const names = splitPeople(value);
  (names.length ? names : [""]).forEach((name) => addCreditInput(credit, name));
}

function splitPeople(value = "") {
  return String(value)
    .split(/[、,，\n/]+/)
    .map(normalizeName)
    .filter(Boolean);
}

function addRoleInput(role, value = "", customRole = "") {
  const group = roleFields.querySelector(`.role-group[data-role="${escapeSelectorValue(role)}"]`);
  if (!group) return;

  const inputs = group.querySelector(".role-inputs");
  const count = inputs.children.length + 1;

  if (role === "其他") {
    const row = otherInputTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector(".other-role-input").value = customRole;
    row.querySelector(".person-input").value = value;
    inputs.append(row);
    updateRemoveButtons(group);
    return;
  }

  const node = personInputTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector("span").textContent = getRoleLabel(role, count);
  const input = node.querySelector("input");
  input.value = value;
  input.dataset.role = role;
  inputs.append(node);
  updateRoleLabels(group);
  updateRemoveButtons(group);
}

function clearRoleInputs() {
  roleFields.querySelectorAll(".role-group").forEach((group) => {
    group.querySelector(".role-inputs").replaceChildren();
    addRoleInput(group.dataset.role);
  });
}

function removeRoleInput(button) {
  const group = button.closest(".role-group");
  const rows = group.querySelectorAll(".input-row, .other-row");
  if (rows.length <= 1) return;

  button.closest(".input-row, .other-row").remove();
  updateRoleLabels(group);
  updateRemoveButtons(group);
}

function updateRoleLabels(group) {
  const role = group.dataset.role;
  if (role === "其他") return;

  group.querySelectorAll(".input-row").forEach((row, index) => {
    row.querySelector("span").textContent = getRoleLabel(role, index + 1);
  });
}

function getRoleLabel(role, index) {
  return singlePersonRoles.has(role) ? role : `${role}${index}`;
}

function updateRemoveButtons(group) {
  const rows = group.querySelectorAll(".input-row, .other-row");
  const shouldDisable = rows.length <= 1;
  rows.forEach((row) => {
    row.querySelector(".remove-role-button").disabled = shouldDisable;
  });
}

function updateMemberUi() {
  renderMemberOptions();
}

function getPickerMembers(type) {
  const performerNames = state.members.filter((member) => member !== "全體成員");
  return type === "credit" ? ["全體成員", ...performerNames] : performerNames;
}

function openMemberPicker(input) {
  activeMemberInput = input;
  activePickerType = input.dataset.picker || "performer";
  memberDialogTitle.textContent = activePickerType === "credit" ? "選擇創作人員" : "選擇樂手";
  memberSearch.value = "";
  renderMemberOptions();
  openDialog(memberDialog);
  if (!window.matchMedia("(pointer: coarse)").matches) {
    setTimeout(() => memberSearch.focus(), 0);
  }
}

function closeMemberPicker() {
  activeMemberInput = null;
  closeDialog(memberDialog);
}

function openDialog(dialog) {
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
    return;
  }

  dialog.setAttribute("open", "");
  dialog.classList.add("dialog-fallback-open");
}

function closeDialog(dialog) {
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
  dialog.classList.remove("dialog-fallback-open");
}

function renderMemberOptions() {
  if (!memberOptions) return;

  const keyword = memberSearch.value.trim().toLocaleLowerCase();
  const members = getPickerMembers(activePickerType).filter((member) =>
    keyword ? member.toLocaleLowerCase().includes(keyword) : true,
  );

  if (members.length === 0) {
    memberOptions.innerHTML = `<div class="empty-state">沒有符合的成員，可直接在欄位手動輸入</div>`;
    return;
  }

  memberOptions.replaceChildren(
    ...members.map((member) => {
      const button = document.createElement("button");
      button.className = `member-option${member === "全體成員" ? " is-special" : ""}`;
      button.type = "button";
      button.textContent = member;
      button.dataset.member = member;
      return button;
    }),
  );
}

function collectSongFromForm() {
  const performers = {};

  roleFields.querySelectorAll(".role-group").forEach((group) => {
    const role = group.dataset.role;

    if (role === "其他") {
      group.querySelectorAll(".other-row").forEach((row, index) => {
        const customRole = row.querySelector(".other-role-input").value.trim();
        const name = normalizeName(row.querySelector(".person-input").value);
        if (customRole && name) performers[customRole] = name;
        if (!customRole && name) performers[`其他${index + 1}`] = name;
      });
      return;
    }

    group.querySelectorAll(".person-input").forEach((input, index) => {
      const name = normalizeName(input.value);
      if (!name) return;
      performers[getRoleLabel(role, index + 1)] = name;
    });
  });

  return {
    id: state.editingId ?? crypto.randomUUID(),
    title: document.querySelector("#songTitle").value.trim(),
    arranger: getCreditValue("arranger"),
    composer: getCreditValue("composer"),
    lyricist: getCreditValue("lyricist"),
    lyrics: document.querySelector("#lyrics").value.trim(),
    performers,
    createdAt: state.editingId
      ? (state.songs.find((song) => song.id === state.editingId) || {}).createdAt
      : Date.now(),
    updatedAt: Date.now(),
  };
}

function resetForm() {
  form.querySelectorAll("input, textarea").forEach((field) => {
    field.value = "";
  });
  createCreditFields();
  clearRoleInputs();
  state.editingId = null;
  state.formMode = "add";
  submitButton.textContent = "加入報歌";
  resetButton.textContent = "清空";
}

function saveSongs() {
  writeJson(storageKeys.songs, state.songs);
}

function saveMembers() {
  writeJson(storageKeys.members, state.members);
}

async function loadCloudData() {
  state.db = createCloudClient();
  if (!state.db) return;

  const [{ data: songs, error: songError }, { data: memberRows, error: memberError }] =
    await Promise.all([
      state.db.from("songs").select("*").order("created_at", { ascending: false }),
      state.db.from("members").select("names").eq("id", 1).maybeSingle(),
    ]);

  if (songError || memberError) {
    console.warn("Cloud sync unavailable", songError || memberError);
    return;
  }

  state.songs = normalizeSongs(songs.map(fromDbSong));
  state.members = uniqueNames(memberRows && memberRows.names && memberRows.names.length ? memberRows.names : state.members);
  state.isCloudReady = true;
  writeJson(storageKeys.songs, state.songs);
  writeJson(storageKeys.members, state.members);
  updateMemberUi();
  render();
}

function fromDbSong(song) {
  return normalizeSong({
    id: song.id,
    title: song.title,
    arranger: song.arranger ?? "",
    composer: song.composer ?? "",
    lyricist: song.lyricist ?? "",
    lyrics: song.lyrics ?? "",
    performers: normalizePerformers(song.performers),
    createdAt: new Date(song.created_at).getTime(),
    updatedAt: new Date(song.updated_at).getTime(),
  });
}

function toDbSong(song) {
  return {
    id: song.id,
    title: song.title,
    arranger: song.arranger ?? "",
    composer: song.composer ?? "",
    lyricist: song.lyricist ?? "",
    lyrics: song.lyrics,
    performers: normalizePerformers(song.performers),
    created_at: new Date(song.createdAt).toISOString(),
    updated_at: new Date(song.updatedAt).toISOString(),
  };
}

async function syncSong(song, isNew) {
  if (!state.isCloudReady) return;
  if (isNew) {
    const { error } = await state.db.from("songs").insert(toDbSong(song));
    if (error) console.warn("Unable to insert song", error);
    return;
  }
  const { error } = await state.db
    .from("songs")
    .update({
      title: song.title,
      arranger: song.arranger ?? "",
      composer: song.composer ?? "",
      lyricist: song.lyricist ?? "",
      lyrics: song.lyrics ?? "",
      performers: normalizePerformers(song.performers),
      updated_at: new Date(song.updatedAt).toISOString(),
    })
    .eq("id", song.id);
  if (error) console.warn("Unable to update song", error);
}

async function syncSongDelete(songId) {
  if (!state.isCloudReady) return;
  const { error } = await state.db.from("songs").delete().eq("id", songId);
  if (error) console.warn("Unable to delete cloud song", error);
}

async function syncMembers() {
  if (!state.isCloudReady) return;
  const { error } = await state.db
    .from("members")
    .upsert({ id: 1, names: state.members, updated_at: new Date().toISOString() });
  if (error) console.warn("Unable to sync members", error);
}

function getAllPerformers() {
  return uniqueNames(state.songs.flatMap((song) => Object.values(normalizePerformers(song.performers))));
}

function getStats() {
  const stats = new Map();
  state.songs.forEach((song) => {
    const names = Object.entries(normalizePerformers(song.performers))
      .filter(([role]) => !state.statsInstrument || getBaseRole(role) === state.statsInstrument)
      .map(([, name]) => name);

    uniqueNames(names).forEach((name) => {
      stats.set(name, (stats.get(name) ?? 0) + 1);
    });
  });

  return [...stats.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      const countOrder = state.statsSort === "asc" ? a.count - b.count : b.count - a.count;
      return countOrder || a.name.localeCompare(b.name, "zh-Hant");
    });
}

function updateFilter() {
  const selected = personFilter.value;
  const people = getAllPerformers().sort((a, b) => a.localeCompare(b, "zh-Hant"));

  personFilter.replaceChildren(
    new Option("全部顯示", ""),
    ...people.map((person) => new Option(person, person)),
  );

  if (people.includes(selected)) {
    personFilter.value = selected;
  }
}

function updateStatsInstrumentOptions() {
  const selected = statsInstrument.value;
  const instruments = [
    ...new Set(state.songs.flatMap((song) => Object.keys(normalizePerformers(song.performers)).map(getBaseRole))),
  ].sort((a, b) => instrumentGroups.indexOf(a) - instrumentGroups.indexOf(b));

  statsInstrument.replaceChildren(
    new Option("全部", ""),
    ...instruments.map((instrument) => new Option(instrument, instrument)),
  );

  if (instruments.includes(selected)) {
    statsInstrument.value = selected;
  } else {
    statsInstrument.value = "";
    state.statsInstrument = "";
  }
}

function renderSongs() {
  const selectedPerson = personFilter.value;
  const keyword = songSearch.value.trim().toLocaleLowerCase();
  const visibleSongs = state.songs.filter((song) => {
    const performers = normalizePerformers(song.performers);
    const matchesPerson = selectedPerson ? Object.values(performers).includes(selectedPerson) : true;
    const searchableText = `${song.title} ${song.lyrics ?? ""}`.toLocaleLowerCase();
    const matchesKeyword = keyword ? searchableText.includes(keyword) : true;
    return matchesPerson && matchesKeyword;
  });

  songCount.textContent = `${visibleSongs.length} / ${state.songs.length} 首歌`;

  if (visibleSongs.length === 0) {
    songList.innerHTML = `<div class="empty-state">目前沒有符合條件的歌曲</div>`;
    return;
  }

  songList.replaceChildren(
    ...visibleSongs.map((song) => {
      const item = document.createElement("article");
      item.className = "song-item";

      const normalizedPerformers = normalizePerformers(song.performers);
      const performers = Object.entries(normalizedPerformers)
        .map(
          ([role, name]) => {
            const isHighlighted = selectedPerson && name === selectedPerson;
            return `<div class="performer-row${isHighlighted ? " is-highlighted" : ""}"><span class="performer-role">${renderIcon(getRoleIcon(role), "performer-icon")}<span class="performer-role-text">${escapeHtml(role)}</span></span><span class="performer-name">${escapeHtml(name)}</span></div>`;
          },
        )
        .join("");
      const performerCount = uniqueNames(Object.values(normalizedPerformers)).length;
      const credits = [
        ["編曲", song.arranger],
        ["作曲", song.composer],
        ["作詞", song.lyricist],
      ]
        .filter(([, name]) => name)
        .map(([label, name]) => `<span class="credit-chip">${escapeHtml(label)} ${escapeHtml(name)}</span>`)
        .join("");

      item.innerHTML = `
        <div class="song-heading">
          <div>
            <h3>${escapeHtml(song.title)}</h3>
            <p class="song-meta">${performerCount} 位人員${song.lyrics ? " · 有歌詞" : ""}</p>
            ${credits ? `<div class="song-credits">${credits}</div>` : ""}
          </div>
          <div class="song-actions">
            <button class="ghost-button" type="button" data-action="edit" data-id="${song.id}">編輯</button>
            <button class="delete-button" type="button" data-action="delete" data-id="${song.id}" aria-label="刪除 ${escapeHtml(song.title)}">刪除</button>
          </div>
        </div>
        <div class="performers">${performers || `<span class="no-performer">未填人員</span>`}</div>
        ${
          song.lyrics
            ? `<div class="song-footer"><button class="ghost-button" type="button" data-action="lyrics" data-id="${song.id}">歌詞</button></div>`
            : ""
        }
      `;

      return item;
    }),
  );
  renderLucideIcons();
}

function renderStats() {
  updateStatsInstrumentOptions();
  const stats = getStats();
  const maxCount = Math.max(...stats.map((item) => item.count), 1);
  statsSort.value = state.statsSort;
  statsInstrument.value = state.statsInstrument;

  if (stats.length === 0) {
    statsList.innerHTML = `<div class="empty-state">填入表演人員後會顯示統計</div>`;
    return;
  }

  statsList.replaceChildren(
    ...stats.map(({ name, count }) => {
      const item = document.createElement("button");
      item.className = "stat-bar";
      item.type = "button";
      item.dataset.person = name;
      const percentage = Math.max(5, Math.round((count / maxCount) * 100));
      item.innerHTML = `
        <span class="stat-bar-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
        <span class="stat-bar-track" aria-hidden="true">
          <span class="stat-bar-fill" style="width: ${percentage}%"></span>
        </span>
        <span class="stat-bar-value">${count} 首</span>
      `;
      return item;
    }),
  );
}

function render() {
  updateFilter();
  renderActiveTab();
  exportButton.title = state.isCloudReady ? "資料已連到 Supabase" : "目前使用本機資料";
}

function renderActiveTab() {
  if (state.activeTab === "stats") {
    renderStats();
    return;
  }

  renderSongs();
}

function setActiveTab(tab) {
  state.activeTab = tab;
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === tab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
  tabViews.forEach((view) => {
    view.classList.toggle("is-active", view.dataset.view === tab);
  });
  renderActiveTab();
}

function editSong(songId) {
  const song = state.songs.find((item) => item.id === songId);
  if (!song) return;

  state.editingId = song.id;
  state.formMode = "edit";
  editFormHost.append(form);
  submitButton.textContent = "更新報歌";
  resetButton.textContent = "取消";
  document.querySelector("#songTitle").value = song.title;
  setCreditValue("arranger", song.arranger);
  setCreditValue("composer", song.composer);
  setCreditValue("lyricist", song.lyricist);
  document.querySelector("#lyrics").value = song.lyrics;
  clearRoleInputs();

  Object.entries(normalizePerformers(song.performers)).forEach(([roleLabel, name]) => {
    const groupRole = getBaseRole(roleLabel);

    if (groupRole === "其他") {
      const otherInputs = roleFields.querySelector(`.role-group[data-role="其他"] .role-inputs`);
      const firstEmpty = [...otherInputs.querySelectorAll(".other-row")].find((row) => {
        return !row.querySelector(".other-role-input").value && !row.querySelector(".person-input").value;
      });
      const row = firstEmpty ?? addOtherAndReturn();
      row.querySelector(".other-role-input").value = roleLabel.startsWith("其他") ? "" : roleLabel;
      row.querySelector(".person-input").value = name;
      return;
    }

    const group = roleFields.querySelector(`.role-group[data-role="${escapeSelectorValue(groupRole)}"]`);
    const inputs = group.querySelectorAll(".person-input");
    const emptyInput = [...inputs].find((input) => !input.value);
    if (emptyInput) {
      emptyInput.value = name;
    } else {
      addRoleInput(groupRole, name);
    }
  });
  openDialog(editDialog);
}

function closeEditDialog({ shouldReset = true } = {}) {
  formHost.append(form);
  if (editDialog.open) closeDialog(editDialog);
  if (shouldReset) resetForm();
}

function addOtherAndReturn() {
  addRoleInput("其他");
  const rows = roleFields.querySelectorAll(`.role-group[data-role="其他"] .other-row`);
  return rows[rows.length - 1];
}

function getBaseRole(roleLabel) {
  const matched = instrumentGroups
    .filter((role) => role !== "其他")
    .find((role) => roleLabel === role || roleLabel.startsWith(role));
  return matched ?? "其他";
}

function getRoleIcon(roleLabel) {
  const baseRole = getBaseRole(roleLabel);
  return roleIcons[baseRole] ?? roleIcons.其他;
}

function renderIcon(name, className) {
  return `<span class="${className}" aria-hidden="true"><i data-lucide="${name}"></i></span>`;
}

function renderLucideIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function deleteSong(songId) {
  const song = state.songs.find((item) => item.id === songId);
  const songName = song && song.title ? `「${song.title}」` : "這首歌";
  state.pendingDeleteId = songId;
  deleteDialogText.textContent = `確定要刪除${songName}嗎？刪除後無法復原。`;
  openDialog(deleteDialog);
}

function confirmDeleteSong() {
  const songId = state.pendingDeleteId;
  if (!songId) return;

  state.songs = state.songs.filter((song) => song.id !== songId);
  state.pendingDeleteId = null;
  closeDialog(deleteDialog);
  saveSongs();
  syncSongDelete(songId);
  render();
}

function cancelDeleteSong() {
  state.pendingDeleteId = null;
  closeDialog(deleteDialog);
}

function openLyrics(songId) {
  const song = state.songs.find((item) => item.id === songId);
  if (!song) return;

  lyricsDialogTitle.textContent = song.title;
  lyricsDialogContent.textContent = song.lyrics || "沒有填寫歌詞";
  openDialog(lyricsDialog);
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

function exportSongs() {
  const content = state.songs
    .map((song, index) => {
      const credits = [
        song.arranger ? `編曲: ${song.arranger}` : "",
        song.composer ? `作曲: ${song.composer}` : "",
        song.lyricist ? `作詞: ${song.lyricist}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const performers = Object.entries(normalizePerformers(song.performers))
        .map(([role, name]) => `${role}: ${name}`)
        .join("\n");
      return `${index + 1}. ${song.title}${credits ? `\n${credits}` : ""}\n${performers}${song.lyrics ? `\n\n歌詞:\n${song.lyrics}` : ""}`;
    })
    .join("\n\n---\n\n");

  navigator.clipboard.writeText(content || "目前沒有報歌").then(() => {
    exportButton.textContent = "已複製";
    setTimeout(() => {
      exportButton.textContent = "匯出";
    }, 1200);
  });
}

function exportExcel() {
  if (!window.XLSX) {
    excelExportButton.textContent = "無法匯出";
    setTimeout(() => {
      excelExportButton.textContent = "Excel";
    }, 1400);
    return;
  }

  const roleColumns = getRoleColumns();
  const songRows = state.songs.map((song, index) => {
      const row = {
        序號: index + 1,
        歌名: song.title,
        編曲: song.arranger ?? "",
      作曲: song.composer ?? "",
      作詞: song.lyricist ?? "",
      歌詞: song.lyrics ?? "",
    };

    const performers = normalizePerformers(song.performers);
    roleColumns.forEach((role) => {
      row[role] = performers[role] ?? "";
    });

    return row;
  });

  const statsRows = getStats().map((item, index) => ({
    排名: index + 1,
    人員: item.name,
    首數: item.count,
  }));

  const workbook = window.XLSX.utils.book_new();
  const songSheet = window.XLSX.utils.json_to_sheet(songRows.length ? songRows : [{ 歌名: "" }]);
  const statsSheet = window.XLSX.utils.json_to_sheet(statsRows.length ? statsRows : [{ 人員: "", 首數: "" }]);

  songSheet["!cols"] = [
    { wch: 6 },
    { wch: 24 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 36 },
    ...roleColumns.map(() => ({ wch: 13 })),
  ];
  statsSheet["!cols"] = [{ wch: 6 }, { wch: 16 }, { wch: 8 }];

  window.XLSX.utils.book_append_sheet(workbook, songSheet, "報歌表");
  window.XLSX.utils.book_append_sheet(workbook, statsSheet, "人員統計");
  window.XLSX.writeFile(workbook, `社團報歌表-${getDateStamp()}.xlsx`);
}

function getRoleColumns() {
  const columns = [];
  const baseRoles = ["主唱1", "主唱2", "電吉他1", "電吉他2", "KB1", "KB2", "木吉他1", "木吉他2", "Bass", "鼓", "木箱鼓"];

  [...baseRoles, ...state.songs.flatMap((song) => Object.keys(normalizePerformers(song.performers)))].forEach((role) => {
    if (!columns.includes(role)) columns.push(role);
  });

  return columns;
}

function getDateStamp() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
}

createRoleFields();
createCreditFields();
updateMemberUi();
render();
loadCloudData();

roleFields.addEventListener("click", (event) => {
  const button = event.target.closest(".add-role-button");
  if (button) {
    addRoleInput(button.dataset.role);
    return;
  }

  const removeButton = event.target.closest(".remove-role-button");
  if (removeButton) removeRoleInput(removeButton);
});

document.querySelector(".credit-grid").addEventListener("click", (event) => {
  const addButton = event.target.closest(".add-credit-button");
  if (addButton) {
    addCreditInput(addButton.dataset.credit);
    return;
  }

  const removeButton = event.target.closest(".remove-credit-button");
  if (removeButton) removeCreditInput(removeButton);
});

form.addEventListener("touchstart", (event) => {
  const input = event.target.closest(".member-picker-input");
  if (!input) return;
  pickerTouchInput = input;
  pickerTouchStartY = event.touches[0].clientY;
  pickerTouchScrolled = false;
}, { passive: false });

form.addEventListener("touchmove", (event) => {
  if (!pickerTouchInput) return;
  if (Math.abs(event.touches[0].clientY - pickerTouchStartY) > 8) pickerTouchScrolled = true;
}, { passive: true });

form.addEventListener("touchend", (event) => {
  const input = pickerTouchInput;
  pickerTouchInput = null;
  if (!input || pickerTouchScrolled) return;
  event.preventDefault(); // Prevent focus/keyboard on confirmed tap
  openMemberPicker(input);
}, { passive: false });

form.addEventListener("click", (event) => {
  const input = event.target.closest(".member-picker-input");
  if (!input) return;
  openMemberPicker(input); // Mouse / desktop only
});

form.addEventListener("keydown", (event) => {
  const input = event.target.closest(".member-picker-input");
  if (!input) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openMemberPicker(input);
  }
});

memberSearch.addEventListener("input", renderMemberOptions);

memberOptions.addEventListener("click", (event) => {
  if (memberDialogScrolled) { memberDialogScrolled = false; return; }
  const button = event.target.closest(".member-option");
  if (!button || !activeMemberInput) return;
  const targetInput = activeMemberInput;
  activeMemberInput.value = button.dataset.member;
  closeMemberPicker();
  if (window.matchMedia("(pointer: coarse)").matches) {
    document.activeElement?.blur();
  } else {
    targetInput.focus();
  }
});

memberDialogClose.addEventListener("click", closeMemberPicker);

memberDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeMemberPicker();
});

memberDialog.addEventListener("touchmove", () => {
  memberDialogScrolled = true;
}, { passive: true });

memberDialog.addEventListener("click", (event) => {
  if (memberDialogScrolled) { memberDialogScrolled = false; return; }
  if (event.target === memberDialog) closeMemberPicker();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const wasEditing = state.formMode === "edit";
  const song = collectSongFromForm();
  if (!song.title) return;

  if (state.editingId) {
    state.songs = state.songs.map((item) => (item.id === state.editingId ? song : item));
  } else {
    state.songs = [song, ...state.songs];
  }

  saveSongs();
  syncSong(song, !wasEditing);
  if (wasEditing) {
    closeEditDialog({ shouldReset: false });
    resetForm();
  } else {
    resetForm();
  }
  render();
});

form.addEventListener("reset", (event) => {
  event.preventDefault();

  if (state.formMode === "edit") {
    closeEditDialog();
    return;
  }

  resetForm();
});

personFilter.addEventListener("change", renderSongs);

songSearch.addEventListener("input", renderSongs);

statsSort.addEventListener("change", () => {
  state.statsSort = statsSort.value;
  renderStats();
});

statsInstrument.addEventListener("change", () => {
  state.statsInstrument = statsInstrument.value;
  renderStats();
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.tab);
  });
});

songList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  if (button.dataset.action === "edit") editSong(button.dataset.id);
  if (button.dataset.action === "delete") deleteSong(button.dataset.id);
  if (button.dataset.action === "lyrics") openLyrics(button.dataset.id);
});

lyricsDialogClose.addEventListener("click", () => {
  closeDialog(lyricsDialog);
});

lyricsDialog.addEventListener("click", (event) => {
  if (event.target === lyricsDialog) closeDialog(lyricsDialog);
});

editDialogClose.addEventListener("click", () => {
  closeEditDialog();
});

editDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeEditDialog();
});

editDialog.addEventListener("click", (event) => {
  if (event.target === editDialog) closeEditDialog();
});

confirmDeleteButton.addEventListener("click", confirmDeleteSong);
cancelDeleteButton.addEventListener("click", cancelDeleteSong);

deleteDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  cancelDeleteSong();
});

deleteDialog.addEventListener("click", (event) => {
  if (event.target === deleteDialog) cancelDeleteSong();
});

statsList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-person]");
  if (!button) return;
  personFilter.value = button.dataset.person;
  setActiveTab("songs");
  document.querySelector("#songList").scrollIntoView({ behavior: "smooth", block: "start" });
});

exportButton.addEventListener("click", exportSongs);
excelExportButton.addEventListener("click", exportExcel);
