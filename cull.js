const state = {
  songs: [],
  db: null,
  isUnlocked: false,
  channel: null,
};

const devPassphrase = "dcband";

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

function createCloudClient() {
  const config = window.SUPABASE_CONFIG;
  if (!config?.url || !config?.anonKey || !window.supabase) return null;
  return window.supabase.createClient(config.url, config.anonKey);
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function unlock(passphrase) {
  state.db = createCloudClient();
  if (!state.db) {
    if (passphrase === devPassphrase) {
      unlockWithoutCloud();
      return;
    }

    gateStatus.textContent = "尚未設定 Supabase。測試用密語請輸入 dcband。";
    return;
  }

  gateStatus.textContent = "檢查密語中...";
  const { data, error } = await state.db
    .from("app_settings")
    .select("value")
    .eq("key", "cull_passphrase_hash")
    .maybeSingle();

  if (error || !data?.value || data.value === "CHANGE_ME_SHA256") {
    if (passphrase === devPassphrase) {
      gateStatus.textContent = "資料庫密語尚未設定，目前使用測試模式。";
      unlockWithoutCloud();
      return;
    }

    gateStatus.textContent = "資料庫尚未設定通關密語。測試用密語請輸入 dcband。";
    return;
  }

  const inputHash = await sha256(passphrase);
  if (inputHash !== data.value) {
    gateStatus.textContent = "密語不正確。";
    return;
  }

  state.isUnlocked = true;
  gatePanel.hidden = true;
  cullPanels.forEach((panel) => panel.classList.remove("is-locked"));
  await loadSongs();
  subscribeToSongs();
}

function unlockWithoutCloud() {
  state.isUnlocked = true;
  gatePanel.hidden = true;
  cullPanels.forEach((panel) => panel.classList.remove("is-locked"));
  syncStatus.textContent = "測試模式：尚未連接資料庫";
  state.songs = readLocalSongs();
  render();
}

function readLocalSongs() {
  try {
    return JSON.parse(localStorage.getItem("club-song-list:songs")) ?? [];
  } catch {
    return [];
  }
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
        </div>
      `;
      return item;
    }),
  );
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

  if (!state.db) {
    localStorage.setItem("club-song-list:songs", JSON.stringify(state.songs));
    return;
  }

  const { error } = await state.db
    .from("songs")
    .update({
      is_eliminated: isEliminated,
      eliminated_at: isEliminated ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", songId);

  if (error) {
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
