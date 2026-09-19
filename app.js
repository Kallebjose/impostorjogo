import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  remove,
  onValue,
  onDisconnect,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

import { firebaseConfig } from "./firebase-config.js";
import { drawPair, CATEGORY_LABELS } from "./words.js";

const $ = (id) => document.getElementById(id);
const screens = [...document.querySelectorAll(".screen")];

const state = {
  user: null,
  roomCode: "",
  room: {
    hostUid: null,
    status: null,
    createdAt: null,
    round: 0,
    config: null,
    meta: null,
    result: null
  },
  players: {},
  mySecret: null,
  myVote: null,
  openedWord: false,
  roomUnsubs: [],
  privateUnsub: null,
  voteUnsub: null,
  connectionUnsub: null,
  hostClaimTimer: null,
  rendering: false
};

let app;
let auth;
let db;

function showScreen(id) {
  screens.forEach((screen) => screen.classList.toggle("active", screen.id === id));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2300);
}

function setConnection(mode, text) {
  $("connectionDot").classList.toggle("online", mode === "online");
  $("connectionDot").classList.toggle("error", mode === "error");
  $("connectionText").textContent = text;
}

function cleanName(value) {
  return String(value || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function randomCode(length = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const nums = new Uint32Array(length);
  crypto.getRandomValues(nums);
  return [...nums].map((n) => chars[n % chars.length]).join("");
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function isHost() {
  return Boolean(state.user && state.room.hostUid === state.user.uid);
}

function roomPath(path = "") {
  return `rooms/${state.roomCode}${path ? `/${path}` : ""}`;
}

function roomRef(path = "") {
  return ref(db, roomPath(path));
}

function clearRoomSubscriptions() {
  state.roomUnsubs.forEach((unsub) => {
    try { unsub(); } catch {}
  });
  state.roomUnsubs = [];

  if (state.privateUnsub) {
    try { state.privateUnsub(); } catch {}
    state.privateUnsub = null;
  }

  if (state.voteUnsub) {
    try { state.voteUnsub(); } catch {}
    state.voteUnsub = null;
  }

  if (state.hostClaimTimer) {
    clearTimeout(state.hostClaimTimer);
    state.hostClaimTimer = null;
  }
}

function resetRoomState() {
  clearRoomSubscriptions();
  state.roomCode = "";
  state.room = {
    hostUid: null,
    status: null,
    createdAt: null,
    round: 0,
    config: null,
    meta: null,
    result: null
  };
  state.players = {};
  state.mySecret = null;
  state.myVote = null;
  state.openedWord = false;
  localStorage.removeItem("impostor:activeRoom");
}

async function waitForUser() {
  if (state.user) return state.user;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Não foi possível autenticar no Firebase.")), 10000);
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) return;
      clearTimeout(timeout);
      unsub();
      resolve(user);
    });
  });
}

async function setupFirebase() {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);

    await setPersistence(auth, browserLocalPersistence);
    onAuthStateChanged(auth, (user) => {
      state.user = user;
      if (user) setConnection("online", "ONLINE");
    });

    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }

    state.user = auth.currentUser || await waitForUser();

    state.connectionUnsub = onValue(ref(db, ".info/connected"), async (snap) => {
      const connected = snap.val() === true;
      setConnection(connected ? "online" : "offline", connected ? "ONLINE" : "RECONECTANDO");

      if (connected && state.roomCode && state.user) {
        await armPresence().catch(console.error);
      }
    });

    await tryResumeRoom();
  } catch (error) {
    console.error("Firebase init:", error);
    setConnection("error", "ERRO FIREBASE");
    $("setupWarning").classList.remove("hidden");
    $("setupWarning").textContent =
      `Firebase não conectou: ${friendlyFirebaseError(error)}. Abra o console (F12) para detalhes.`;
  }
}

function friendlyFirebaseError(error) {
  const code = error?.code || "";
  if (code.includes("operation-not-allowed")) return "ative o login Anônimo em Authentication";
  if (code.includes("unauthorized-domain")) return "adicione este domínio em Authentication > Settings > Authorized domains";
  if (code.includes("permission-denied")) return "publique o arquivo firebase.rules.json nas regras do Realtime Database";
  if (code.includes("network")) return "verifique sua conexão";
  return error?.message || "erro desconhecido";
}

async function generateUniqueRoomCode() {
  for (let i = 0; i < 12; i++) {
    const code = randomCode();
    const snap = await get(ref(db, `rooms/${code}/hostUid`));
    if (!snap.exists()) return code;
  }
  throw new Error("Não foi possível gerar um código de sala. Tente novamente.");
}

function playerPayload(name) {
  const now = Date.now();
  return {
    name,
    score: 0,
    ready: false,
    hasVoted: false,
    online: true,
    joinedAt: now,
    lastSeen: now
  };
}

async function createRoom() {
  const name = cleanName($("createName").value);
  if (!name) return toast("Digite seu nome.");

  setBusy($("createRoomBtn"), true, "CRIANDO...");

  try {
    const user = await waitForUser();
    const code = await generateUniqueRoomCode();

    const room = {
      hostUid: user.uid,
      status: "lobby",
      createdAt: Date.now(),
      round: 0,
      config: {
        category: "mix",
        mode: "different",
        impostorCount: 1
      },
      meta: {
        starterUid: "",
        category: ""
      },
      players: {
        [user.uid]: playerPayload(name)
      }
    };

    await set(ref(db, `rooms/${code}`), room);

    state.roomCode = code;
    localStorage.setItem("impostor:lastName", name);
    localStorage.setItem("impostor:activeRoom", code);

    await subscribeRoom();
    await armPresence();
    toast("Sala criada.");
  } catch (error) {
    console.error("Create room:", error);
    toast(friendlyFirebaseError(error));
  } finally {
    setBusy($("createRoomBtn"), false, "CRIAR SALA");
  }
}

async function joinRoom() {
  const name = cleanName($("joinName").value);
  const code = $("joinCode").value.trim().toUpperCase();

  if (!name) return toast("Digite seu nome.");
  if (!/^[A-Z2-9]{5}$/.test(code)) return toast("Digite um código válido.");

  setBusy($("joinRoomBtn"), true, "ENTRANDO...");

  try {
    const user = await waitForUser();

    const [hostSnap, statusSnap, playersSnap] = await Promise.all([
      get(ref(db, `rooms/${code}/hostUid`)),
      get(ref(db, `rooms/${code}/status`)),
      get(ref(db, `rooms/${code}/players`))
    ]);

    if (!hostSnap.exists()) return toast("Sala não encontrada.");
    if (statusSnap.val() !== "lobby") return toast("A partida já começou.");

    const players = playersSnap.val() || {};
    if (Object.keys(players).length >= 12) return toast("A sala está cheia.");

    const duplicateName = Object.values(players).some(
      (player) => String(player.name || "").toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR")
    );
    if (duplicateName) return toast("Já existe alguém com esse nome na sala.");

    await set(ref(db, `rooms/${code}/players/${user.uid}`), playerPayload(name));

    state.roomCode = code;
    localStorage.setItem("impostor:lastName", name);
    localStorage.setItem("impostor:activeRoom", code);

    await subscribeRoom();
    await armPresence();
    toast("Você entrou na sala.");
  } catch (error) {
    console.error("Join room:", error);
    toast(friendlyFirebaseError(error));
  } finally {
    setBusy($("joinRoomBtn"), false, "ENTRAR");
  }
}

async function tryResumeRoom() {
  const code = localStorage.getItem("impostor:activeRoom");
  if (!code || !state.user) return;

  try {
    const [hostSnap, playerSnap] = await Promise.all([
      get(ref(db, `rooms/${code}/hostUid`)),
      get(ref(db, `rooms/${code}/players/${state.user.uid}`))
    ]);

    if (!hostSnap.exists() || !playerSnap.exists()) {
      localStorage.removeItem("impostor:activeRoom");
      return;
    }

    state.roomCode = code;
    await update(ref(db, `rooms/${code}/players/${state.user.uid}`), {
      online: true,
      lastSeen: Date.now()
    });

    await subscribeRoom();
    await armPresence();
    toast("Sala restaurada.");
  } catch (error) {
    console.error("Resume room:", error);
    localStorage.removeItem("impostor:activeRoom");
  }
}

async function armPresence() {
  if (!state.roomCode || !state.user) return;

  const pRef = ref(db, `rooms/${state.roomCode}/players/${state.user.uid}`);
  const snap = await get(pRef);
  if (!snap.exists()) return;

  await update(pRef, {
    online: true,
    lastSeen: Date.now()
  });

  await onDisconnect(pRef).update({
    online: false,
    lastSeen: serverTimestamp()
  });
}

async function subscribeRoom() {
  clearRoomSubscriptions();

  const watch = (path, handler) => {
    const unsub = onValue(roomRef(path), handler, (error) => {
      console.error(`Listener ${path}:`, error);
      toast(friendlyFirebaseError(error));
    });
    state.roomUnsubs.push(unsub);
  };

  watch("hostUid", (snap) => {
    if (!snap.exists()) {
      toast("A sala foi encerrada.");
      resetRoomState();
      showScreen("homeScreen");
      return;
    }
    state.room.hostUid = snap.val();
    renderCurrent();
    scheduleHostClaim();
  });

  watch("status", (snap) => {
    state.room.status = snap.val();
    state.openedWord = false;
    renderCurrent();
  });

  watch("createdAt", (snap) => {
    state.room.createdAt = snap.val();
  });

  watch("round", (snap) => {
    state.room.round = Number(snap.val() || 0);
    renderCurrent();
  });

  watch("config", (snap) => {
    state.room.config = snap.val() || {};
    renderCurrent();
  });

  watch("meta", (snap) => {
    state.room.meta = snap.val() || {};
    renderCurrent();
  });

  watch("result", (snap) => {
    state.room.result = snap.exists() ? snap.val() : null;
    renderCurrent();
  });

  watch("players", (snap) => {
    state.players = snap.val() || {};

    if (state.user && !state.players[state.user.uid]) {
      toast("Você não está mais nesta sala.");
      resetRoomState();
      showScreen("homeScreen");
      return;
    }

    renderCurrent();
    scheduleHostClaim();
  });

  state.privateUnsub = onValue(roomRef(`private/${state.user.uid}`), (snap) => {
    state.mySecret = snap.exists() ? snap.val() : null;
    renderCurrent();
  }, (error) => console.error("Private listener:", error));

  state.voteUnsub = onValue(roomRef(`votes/${state.user.uid}`), (snap) => {
    state.myVote = snap.exists() ? snap.val() : null;
    renderCurrent();
  }, (error) => console.error("Vote listener:", error));
}

function scheduleHostClaim() {
  if (!state.user || !state.roomCode || !state.room.hostUid) return;

  const hostPlayer = state.players[state.room.hostUid];
  if (!hostPlayer || hostPlayer.online === false) {
    const onlineEntries = Object.entries(state.players)
      .filter(([, player]) => player.online !== false)
      .sort((a, b) => Number(a[1].joinedAt || 0) - Number(b[1].joinedAt || 0));

    if (onlineEntries[0]?.[0] !== state.user.uid) return;

    clearTimeout(state.hostClaimTimer);
    state.hostClaimTimer = setTimeout(async () => {
      try {
        const hostNow = await get(roomRef("hostUid"));
        const hostUid = hostNow.val();
        const hostOnline = await get(roomRef(`players/${hostUid}/online`));

        if (!hostOnline.exists() || hostOnline.val() === false) {
          await set(roomRef("hostUid"), state.user.uid);
          toast("Você agora é o host.");
        }
      } catch (error) {
        console.error("Host claim:", error);
      }
    }, 5000);
  }
}

function renderCurrent() {
  if (state.rendering || !state.room.status) return;
  state.rendering = true;

  try {
    switch (state.room.status) {
      case "lobby":
        showScreen("lobbyScreen");
        renderLobby();
        break;
      case "reveal":
        showScreen("revealScreen");
        renderReveal();
        break;
      case "discussion":
        showScreen("discussionScreen");
        renderDiscussion();
        break;
      case "voting":
        showScreen("voteScreen");
        renderVoting();
        break;
      case "result":
        showScreen("resultScreen");
        renderResult();
        break;
      default:
        break;
    }
  } finally {
    state.rendering = false;
  }
}

function renderLobby() {
  $("roomCodeText").textContent = state.roomCode;
  $("playerCount").textContent = `${Object.keys(state.players).length}/12`;

  const sorted = Object.entries(state.players)
    .sort((a, b) => Number(a[1].joinedAt || 0) - Number(b[1].joinedAt || 0));

  $("playersList").innerHTML = sorted.map(([uid, player]) => {
    const hostTag = uid === state.room.hostUid ? '<span class="badge blue">HOST</span>' : "";
    const meTag = uid === state.user?.uid ? '<span class="badge">VOCÊ</span>' : "";
    const kick = isHost() && uid !== state.user.uid
      ? `<button class="kickBtn" data-kick="${uid}" title="Remover jogador" type="button">×</button>`
      : "";

    return `
      <div class="playerRow">
        <div class="playerMain">
          <div class="avatar">${escapeHtml(player.name?.[0]?.toUpperCase() || "?")}</div>
          <div class="playerName">${escapeHtml(player.name || "Jogador")}</div>
        </div>
        <div class="playerMeta">
          <span class="onlineDot ${player.online !== false ? "on" : ""}" title="${player.online !== false ? "Online" : "Offline"}"></span>
          ${meTag}${hostTag}${kick}
        </div>
      </div>
    `;
  }).join("");

  document.querySelectorAll("[data-kick]").forEach((button) => {
    button.addEventListener("click", () => kickPlayer(button.dataset.kick));
  });

  $("hostSettings").classList.toggle("hidden", !isHost());
  $("guestWaiting").classList.toggle("hidden", isHost());

  if (isHost()) {
    $("categorySelect").value = state.room.config?.category || "mix";
    $("modeSelect").value = state.room.config?.mode || "different";
    $("impostorCountSelect").value = String(state.room.config?.impostorCount || 1);

    const onlineCount = Object.values(state.players).filter((player) => player.online !== false).length;
    const impostors = Number(state.room.config?.impostorCount || 1);
    $("startGameBtn").disabled = onlineCount < 3 || (impostors === 2 && onlineCount < 6);
  }
}

async function kickPlayer(uid) {
  if (!isHost() || !state.players[uid]) return;
  const name = state.players[uid].name || "jogador";
  if (!confirm(`Remover ${name} da sala?`)) return;

  try {
    const updates = {};
    updates[`players/${uid}`] = null;
    updates[`private/${uid}`] = null;
    updates[`votes/${uid}`] = null;
    await update(roomRef(), updates);
  } catch (error) {
    console.error("Kick:", error);
    toast(friendlyFirebaseError(error));
  }
}

async function saveConfig() {
  if (!isHost()) return;

  const config = {
    category: $("categorySelect").value,
    mode: $("modeSelect").value,
    impostorCount: Number($("impostorCountSelect").value)
  };

  try {
    await set(roomRef("config"), config);
  } catch (error) {
    console.error("Config:", error);
    toast(friendlyFirebaseError(error));
  }
}

async function startGame() {
  if (!isHost()) return;

  const activeEntries = Object.entries(state.players)
    .filter(([, player]) => player.online !== false);

  const impostorCount = Number(state.room.config?.impostorCount || 1);

  if (activeEntries.length < 3) return toast("São necessários pelo menos 3 jogadores online.");
  if (impostorCount === 2 && activeEntries.length < 6) return toast("Use pelo menos 6 jogadores para 2 impostores.");

  setBusy($("startGameBtn"), true, "SORTEANDO...");

  try {
    // Remove offline players antes da rodada.
    const offlineIds = Object.entries(state.players)
      .filter(([, player]) => player.online === false)
      .map(([uid]) => uid);

    const playerIds = activeEntries.map(([uid]) => uid);
    const shuffled = shuffle(playerIds);
    const impostorIds = new Set(shuffled.slice(0, impostorCount));
    const starterUid = shuffled[Math.floor(Math.random() * shuffled.length)];
    const pair = drawPair(state.room.config?.category || "mix");
    const mode = state.room.config?.mode || "different";

    const updates = {
      status: "reveal",
      round: Number(state.room.round || 0) + 1,
      result: null,
      votes: null,
      meta: {
        starterUid,
        category: pair.category
      }
    };

    for (const uid of offlineIds) {
      updates[`players/${uid}`] = null;
      updates[`private/${uid}`] = null;
      updates[`votes/${uid}`] = null;
    }

    for (const uid of playerIds) {
      updates[`players/${uid}/ready`] = false;
      updates[`players/${uid}/hasVoted`] = false;
      updates[`private/${uid}`] = {
        role: impostorIds.has(uid) ? "impostor" : "civil",
        word: impostorIds.has(uid)
          ? (mode === "blank" ? "" : pair.impostorWord)
          : pair.civilianWord
      };
    }

    // O host precisa conhecer as duas palavras apenas para montar o resultado no fim.
    updates.hostRound = {
      civilianWord: pair.civilianWord,
      impostorWord: mode === "blank" ? "" : pair.impostorWord
    };

    await update(roomRef(), updates);
  } catch (error) {
    console.error("Start game:", error);
    toast(friendlyFirebaseError(error));
  } finally {
    setBusy($("startGameBtn"), false, "INICIAR JOGO");
  }
}

function renderReveal() {
  $("roundNumber").textContent = String(state.room.round || 1);
  $("revealRoomCode").textContent = state.roomCode;

  const currentPlayers = Object.values(state.players).filter((player) => player.online !== false);
  const ready = currentPlayers.filter((player) => player.ready === true).length;
  const total = currentPlayers.length;
  const me = state.players[state.user?.uid];

  $("readyCount").textContent = `${ready}/${total}`;
  $("readyProgress").style.width = total ? `${(ready / total) * 100}%` : "0%";
  $("readyBtn").disabled = !state.mySecret || !state.openedWord || me?.ready === true;
  $("readyBtn").textContent = me?.ready === true ? "PRONTO ✓" : "ESTOU PRONTO";

  const allReady = total >= 3 && ready === total;
  $("discussionBtn").classList.toggle("hidden", !isHost() || !allReady);
  $("revealWait").classList.toggle("hidden", isHost() && allReady);

  if (!state.openedWord) closeSecretVisual();
}

function openSecret() {
  if (!state.mySecret) return toast("Aguardando sua palavra.");

  state.openedWord = true;
  const isImpostorRole = state.mySecret.role === "impostor";
  const word = state.mySecret.word || "";

  $("roleText").textContent = isImpostorRole ? "VOCÊ É O IMPOSTOR" : "SUA PALAVRA";
  $("wordText").textContent = word || "SEM PALAVRA";
  $("wordHint").textContent = isImpostorRole && !word
    ? "Descubra a palavra pelas pistas dos outros."
    : "Memorize e toque novamente para esconder.";

  $("secretClosed").classList.add("hidden");
  $("secretOpen").classList.remove("hidden");

  const me = state.players[state.user?.uid];
  $("readyBtn").disabled = me?.ready === true;
}

function closeSecretVisual() {
  state.openedWord = false;
  $("secretClosed").classList.remove("hidden");
  $("secretOpen").classList.add("hidden");
  const me = state.players[state.user?.uid];
  $("readyBtn").disabled = !state.mySecret || me?.ready === true;
}

async function markReady() {
  if (!state.openedWord) return toast("Veja sua palavra primeiro.");
  try {
    await set(roomRef(`players/${state.user.uid}/ready`), true);
    closeSecretVisual();
  } catch (error) {
    console.error("Ready:", error);
    toast(friendlyFirebaseError(error));
  }
}

async function startDiscussion() {
  if (!isHost()) return;
  try {
    const updates = { status: "discussion" };
    for (const [uid, player] of Object.entries(state.players)) {
      if (player.online === false) {
        updates[`players/${uid}`] = null;
        updates[`private/${uid}`] = null;
        updates[`votes/${uid}`] = null;
      }
    }
    await update(roomRef(), updates);
  } catch (error) {
    console.error(error);
    toast(friendlyFirebaseError(error));
  }
}

function renderDiscussion() {
  const starter = state.players[state.room.meta?.starterUid];
  $("starterText").textContent = `Começa: ${starter?.name || "jogador sorteado"}`;
  $("startVoteBtn").classList.toggle("hidden", !isHost());
  $("discussionWait").classList.toggle("hidden", isHost());
}

async function startVoting() {
  if (!isHost()) return;

  try {
    const updates = {
      status: "voting",
      votes: null
    };

    for (const [uid, player] of Object.entries(state.players)) {
      if (player.online === false) {
        updates[`players/${uid}`] = null;
        updates[`private/${uid}`] = null;
        updates[`votes/${uid}`] = null;
      } else {
        updates[`players/${uid}/hasVoted`] = false;
      }
    }

    await update(roomRef(), updates);
  } catch (error) {
    console.error("Start voting:", error);
    toast(friendlyFirebaseError(error));
  }
}

function renderVoting() {
  const me = state.players[state.user?.uid];
  const activeEntries = Object.entries(state.players).filter(([, player]) => player.online !== false);
  const voted = activeEntries.filter(([, player]) => player.hasVoted === true).length;
  const total = activeEntries.length;

  $("votedCount").textContent = `${voted}/${total}`;

  $("voteGrid").innerHTML = activeEntries
    .filter(([uid]) => uid !== state.user?.uid)
    .map(([uid, player]) => `
      <button class="voteCard ${state.myVote === uid ? "selected" : ""}"
              data-vote="${uid}"
              ${state.myVote ? "disabled" : ""}>
        <strong>${escapeHtml(player.name)}</strong>
        <span>${state.myVote === uid ? "Seu voto" : "Votar neste jogador"}</span>
      </button>
    `).join("");

  document.querySelectorAll("[data-vote]").forEach((button) => {
    button.addEventListener("click", () => castVote(button.dataset.vote));
  });

  $("voteMessage").textContent = state.myVote
    ? `Voto registrado em ${state.players[state.myVote]?.name || "jogador"}.`
    : "Seu voto não poderá ser alterado.";

  $("resultBtn").classList.toggle("hidden", !isHost() || voted !== total || total < 3);
}

async function castVote(targetUid) {
  if (state.myVote) return;
  if (!state.players[targetUid] || targetUid === state.user.uid) return;

  try {
    // Primeiro grava o voto privado; só então marca o status público.
    await set(roomRef(`votes/${state.user.uid}`), targetUid);
    await set(roomRef(`players/${state.user.uid}/hasVoted`), true);
  } catch (error) {
    console.error("Vote:", error);
    toast(friendlyFirebaseError(error));
  }
}

async function revealResult() {
  if (!isHost()) return;

  setBusy($("resultBtn"), true, "CALCULANDO...");

  try {
    const [votesSnap, privateSnap, hostRoundSnap] = await Promise.all([
      get(roomRef("votes")),
      get(roomRef("private")),
      get(roomRef("hostRound"))
    ]);

    const votesRaw = votesSnap.val() || {};
    const secrets = privateSnap.val() || {};
    const hostRound = hostRoundSnap.val() || {};
    const currentIds = new Set(
      Object.entries(state.players)
        .filter(([, player]) => player.online !== false)
        .map(([uid]) => uid)
    );

    const validVotes = {};
    for (const [voterUid, targetUid] of Object.entries(votesRaw)) {
      if (currentIds.has(voterUid) && currentIds.has(targetUid)) {
        validVotes[voterUid] = targetUid;
      }
    }

    if (Object.keys(validVotes).length !== currentIds.size) {
      return toast("Ainda falta voto de algum jogador.");
    }

    const tally = {};
    for (const targetUid of Object.values(validVotes)) {
      tally[targetUid] = (tally[targetUid] || 0) + 1;
    }

    const maxVotes = Math.max(...Object.values(tally));
    const top = Object.keys(tally).filter((uid) => tally[uid] === maxVotes);
    const tie = top.length !== 1;
    const eliminatedUid = tie ? "" : top[0];

    const impostorUids = Object.entries(secrets)
      .filter(([uid, secret]) => currentIds.has(uid) && secret?.role === "impostor")
      .map(([uid]) => uid);

    const caught = Boolean(eliminatedUid && impostorUids.includes(eliminatedUid));

    const updates = {
      status: "result",
      result: {
        caught,
        tie,
        eliminatedUid,
        impostorUids,
        tally,
        civilianWord: hostRound.civilianWord || "",
        impostorWord: hostRound.impostorWord || "",
        revealedAt: Date.now()
      }
    };

    for (const [uid, player] of Object.entries(state.players)) {
      const role = secrets[uid]?.role;
      let bonus = 0;

      if (caught && role === "civil") bonus += 2;
      if (!caught && role === "impostor") bonus += 2;
      if (role === "civil" && impostorUids.includes(validVotes[uid])) bonus += 1;

      updates[`players/${uid}/score`] = Number(player.score || 0) + bonus;
    }

    await update(roomRef(), updates);
  } catch (error) {
    console.error("Reveal result:", error);
    toast(friendlyFirebaseError(error));
  } finally {
    setBusy($("resultBtn"), false, "REVELAR RESULTADO");
  }
}

function renderResult() {
  const result = state.room.result || {};
  const caught = result.caught === true;
  const tie = result.tie === true;

  if (tie) {
    $("resultTitle").textContent = "Empate na votação.";
    $("resultSubtitle").textContent = "Ninguém foi eliminado. O impostor venceu a rodada.";
  } else if (caught) {
    $("resultTitle").textContent = "O impostor foi descoberto.";
    $("resultSubtitle").textContent = "Os civis venceram a rodada.";
  } else {
    $("resultTitle").textContent = "O impostor escapou.";
    const eliminatedName = state.players[result.eliminatedUid]?.name;
    $("resultSubtitle").textContent = eliminatedName
      ? `${eliminatedName} foi o mais votado, mas não era o impostor.`
      : "Os civis não encontraram o impostor.";
  }

  const mode = state.room.config?.mode || "different";
  $("wordsResult").innerHTML = `
    <div class="resultCard">
      <strong>Civis</strong>
      <span>${escapeHtml(result.civilianWord || "—")}</span>
    </div>
    <div class="resultCard">
      <strong>Impostor</strong>
      <span>${mode === "blank" ? "SEM PALAVRA" : escapeHtml(result.impostorWord || "—")}</span>
    </div>
  `;

  const impostors = Array.isArray(result.impostorUids)
    ? result.impostorUids
    : Object.values(result.impostorUids || {});

  $("impostorResult").innerHTML = impostors.length
    ? impostors.map((uid) => `
        <div class="resultCard">
          <strong>${escapeHtml(state.players[uid]?.name || "Jogador")}</strong>
          <span>Era impostor nesta rodada.</span>
        </div>
      `).join("")
    : '<div class="resultCard"><span>Sem dados.</span></div>';

  const tally = result.tally || {};
  $("votesResult").innerHTML = Object.entries(state.players)
    .sort((a, b) => Number(tally[b[0]] || 0) - Number(tally[a[0]] || 0))
    .map(([uid, player]) => `
      <div class="stackRow">
        <span>${escapeHtml(player.name)}</span>
        <strong>${Number(tally[uid] || 0)} voto(s)</strong>
      </div>
    `).join("");

  $("scoreResult").innerHTML = Object.entries(state.players)
    .sort((a, b) => Number(b[1].score || 0) - Number(a[1].score || 0))
    .map(([, player], index) => `
      <div class="stackRow">
        <span>${index + 1}. ${escapeHtml(player.name)}</span>
        <strong>${Number(player.score || 0)} pts</strong>
      </div>
    `).join("");

  $("againBtn").classList.toggle("hidden", !isHost());
  $("resultWait").classList.toggle("hidden", isHost());
}

async function playAgain() {
  if (!isHost()) return;

  setBusy($("againBtn"), true, "VOLTANDO...");

  try {
    const updates = {
      status: "lobby",
      result: null,
      votes: null,
      private: null,
      hostRound: null,
      meta: {
        starterUid: "",
        category: ""
      }
    };

    for (const uid of Object.keys(state.players)) {
      updates[`players/${uid}/ready`] = false;
      updates[`players/${uid}/hasVoted`] = false;
    }

    state.mySecret = null;
    state.myVote = null;
    state.openedWord = false;

    await update(roomRef(), updates);
  } catch (error) {
    console.error("Again:", error);
    toast(friendlyFirebaseError(error));
  } finally {
    setBusy($("againBtn"), false, "JOGAR NOVAMENTE");
  }
}

async function leaveRoom() {
  if (!state.roomCode || !state.user) {
    resetRoomState();
    return showScreen("homeScreen");
  }

  const code = state.roomCode;
  const uid = state.user.uid;

  try {
    const ids = Object.keys(state.players);
    const otherIds = ids.filter((id) => id !== uid);

    if (isHost()) {
      if (otherIds.length === 0) {
        await remove(ref(db, `rooms/${code}`));
      } else {
        const nextHost = otherIds
          .sort((a, b) => Number(state.players[a].joinedAt || 0) - Number(state.players[b].joinedAt || 0))[0];

        await update(ref(db, `rooms/${code}`), {
          hostUid: nextHost,
          [`players/${uid}`]: null,
          [`private/${uid}`]: null,
          [`votes/${uid}`]: null
        });
      }
    } else {
      await remove(ref(db, `rooms/${code}/players/${uid}`));
    }
  } catch (error) {
    console.error("Leave:", error);
  }

  resetRoomState();
  showScreen("homeScreen");
}

function setBusy(button, busy, busyText) {
  if (!button) return;
  if (!button.dataset.normalText) button.dataset.normalText = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.normalText;
}

async function copyRoomCode() {
  try {
    await navigator.clipboard.writeText(state.roomCode);
    toast("Código copiado.");
  } catch {
    toast(`Código: ${state.roomCode}`);
  }
}

async function shareRoom() {
  const url = new URL(window.location.href);
  url.searchParams.set("room", state.roomCode);

  const payload = {
    title: "IMPOSTOR",
    text: `Entre na minha sala do IMPOSTOR: ${state.roomCode}`,
    url: url.toString()
  };

  try {
    if (navigator.share) {
      await navigator.share(payload);
    } else {
      await navigator.clipboard.writeText(url.toString());
      toast("Link da sala copiado.");
    }
  } catch (error) {
    if (error?.name !== "AbortError") console.error(error);
  }
}

function prefillInvite() {
  const params = new URLSearchParams(window.location.search);
  const code = (params.get("room") || "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 5);
  if (code) $("joinCode").value = code;
}

function bindUI() {
  $("createRoomBtn").addEventListener("click", createRoom);
  $("joinRoomBtn").addEventListener("click", joinRoom);
  $("leaveBtn").addEventListener("click", leaveRoom);
  $("copyCodeBtn").addEventListener("click", copyRoomCode);
  $("shareBtn").addEventListener("click", shareRoom);

  $("categorySelect").addEventListener("change", saveConfig);
  $("modeSelect").addEventListener("change", saveConfig);
  $("impostorCountSelect").addEventListener("change", saveConfig);

  $("startGameBtn").addEventListener("click", startGame);
  $("secretCard").addEventListener("click", () => state.openedWord ? closeSecretVisual() : openSecret());
  $("readyBtn").addEventListener("click", markReady);
  $("discussionBtn").addEventListener("click", startDiscussion);
  $("startVoteBtn").addEventListener("click", startVoting);
  $("resultBtn").addEventListener("click", revealResult);
  $("againBtn").addEventListener("click", playAgain);

  $("brandBtn").addEventListener("click", () => {
    if (!state.roomCode) return showScreen("homeScreen");
    if (confirm("Deseja sair da sala?")) leaveRoom();
  });

  $("joinCode").addEventListener("input", (event) => {
    event.target.value = event.target.value
      .toUpperCase()
      .replace(/[^A-Z2-9]/g, "")
      .slice(0, 5);
  });

  $("createName").addEventListener("keydown", (event) => {
    if (event.key === "Enter") createRoom();
  });

  $("joinCode").addEventListener("keydown", (event) => {
    if (event.key === "Enter") joinRoom();
  });
}

const rememberedName = localStorage.getItem("impostor:lastName");
if (rememberedName) {
  $("createName").value = rememberedName;
  $("joinName").value = rememberedName;
}

prefillInvite();
bindUI();
setupFirebase();
