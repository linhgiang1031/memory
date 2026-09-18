const DB_NAME = "memory-v0-db";
const STORE = "memories";
let db;
let currentId = null;
let stagedCreatePhotos = [];

const $ = (id) => document.getElementById(id);
const views = ["homeView", "createView", "memoryView", "editView"];

function showView(name) {
  views.forEach(v => $(v).classList.toggle("hidden", v !== name));
  window.scrollTo({top:0, behavior:"instant"});
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 1800);
}

function randomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i=0;i<10;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2,"0")).join("");
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function putMemory(memory) {
  return new Promise((resolve,reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(memory);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function getMemory(id) {
  return new Promise((resolve,reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllMemories() {
  return new Promise((resolve,reject) => {
    const req = db.transaction(STORE).objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function deleteMemory(id) {
  return new Promise((resolve,reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function compressImage(file, maxSize=1280, quality=.78) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
  bitmap.close();
  return blob;
}

function blobUrl(blob) { return URL.createObjectURL(blob); }

function renderCreatePreview() {
  const box = $("photoPreview");
  box.innerHTML = "";
  stagedCreatePhotos.forEach(blob => {
    const img = document.createElement("img");
    img.src = blobUrl(blob);
    box.appendChild(img);
  });
}

async function handleCreateFiles(files) {
  const arr = [...files].slice(0,5);
  stagedCreatePhotos = [];
  for (const f of arr) stagedCreatePhotos.push(await compressImage(f));
  renderCreatePreview();
}

function memoryUrl(id) {
  return `${location.origin}${location.pathname}?m=${encodeURIComponent(id)}`;
}

async function renderHome() {
  showView("homeView");
  const memories = await getAllMemories();
  const list = $("memoryList");
  list.innerHTML = "";
  if (!memories.length) {
    list.textContent = "Chưa có Memory nào.";
    list.className = "memory-list empty-state";
    return;
  }
  list.className = "memory-list";
  memories.sort((a,b) => b.updatedAt - a.updatedAt).forEach(m => {
    const row = document.createElement("div");
    row.className = "memory-item";
    row.innerHTML = `<div><strong>${escapeHtml(m.title)}</strong><div class="muted">${m.photos.length} ảnh</div></div>`;
    const btn = document.createElement("button");
    btn.textContent = "Mở";
    btn.onclick = () => openMemory(m.id);
    row.appendChild(btn);
    list.appendChild(row);
  });
}

function escapeHtml(s="") {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function openMemory(id) {
  const m = await getMemory(id);
  if (!m) {
    showView("memoryView");
    $("memoryCard").innerHTML = `<div class="memory-cover"><h1>Không tìm thấy Memory</h1><p>Memory này không tồn tại trên thiết bị này.</p><button class="primary" onclick="history.replaceState({},'',location.pathname); renderHome()">Về trang chính</button></div>`;
    return;
  }
  currentId = id;
  history.replaceState({}, "", `?m=${encodeURIComponent(id)}`);
  showView("memoryView");
  const gallery = m.photos.map(p => `<img src="${blobUrl(p)}" alt="">`).join("");
  const song = m.song ? `<a class="link-btn" href="${escapeHtml(m.song)}" target="_blank" rel="noopener">♪ Mở bài hát</a>` : "";
  $("memoryCard").innerHTML = `
    <div class="memory-cover">
      <div class="eyebrow">MEMORY</div>
      <h1 class="memory-title">${escapeHtml(m.title)}</h1>
      <div class="memory-message">${escapeHtml(m.message || "")}</div>
    </div>
    <div class="gallery">${gallery || `<div class="muted" style="padding:14px">Chưa có ảnh.</div>`}</div>
    <div class="memory-actions">
      ${song}
      <button id="shareBtn" class="edit-btn">Sao chép link</button>
      <button id="editBtn" class="edit-btn">Chỉnh sửa Memory</button>
    </div>`;
  $("editBtn").onclick = () => openEdit(id);
  $("shareBtn").onclick = async () => {
    try {
      await navigator.clipboard.writeText(memoryUrl(id));
      toast("Đã sao chép link");
    } catch {
      prompt("Sao chép link này:", memoryUrl(id));
    }
  };
}

async function openEdit(id) {
  currentId = id;
  $("editForm").classList.add("hidden");
  $("unlockBox").classList.remove("hidden");
  $("editPinInput").value = "";
  $("pinError").textContent = "";
  showView("editView");
}

async function unlockEdit() {
  const m = await getMemory(currentId);
  const pinHash = await sha256($("editPinInput").value);
  if (pinHash !== m.pinHash) {
    $("pinError").textContent = "PIN chưa đúng.";
    return;
  }
  $("unlockBox").classList.add("hidden");
  $("editForm").classList.remove("hidden");
  $("editTitleInput").value = m.title;
  $("editMessageInput").value = m.message || "";
  $("editSongInput").value = m.song || "";
  renderEditPhotos(m);
}

function renderEditPhotos(m) {
  const grid = $("editPhotoGrid");
  grid.innerHTML = "";
  m.photos.forEach((blob, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "photo-edit";
    const img = document.createElement("img");
    img.src = blobUrl(blob);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "×";
    btn.onclick = async () => {
      const fresh = await getMemory(currentId);
      fresh.photos.splice(idx,1);
      fresh.updatedAt = Date.now();
      await putMemory(fresh);
      renderEditPhotos(fresh);
      toast("Đã bỏ ảnh");
    };
    wrap.append(img, btn);
    grid.appendChild(wrap);
  });
}

$("createForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (stagedCreatePhotos.length > 5) return;
  const id = randomId();
  const pinHash = await sha256($("pinInput").value);
  const memory = {
    id,
    title: $("titleInput").value.trim(),
    message: $("messageInput").value.trim(),
    song: $("songInput").value.trim(),
    pinHash,
    photos: stagedCreatePhotos,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await putMemory(memory);
  e.target.reset();
  stagedCreatePhotos = [];
  renderCreatePreview();
  toast("Memory đã được tạo");
  await openMemory(id);
});

$("editForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const m = await getMemory(currentId);
  const addFiles = [...$("editPhotosInput").files];
  const room = 5 - m.photos.length;
  for (const f of addFiles.slice(0,room)) m.photos.push(await compressImage(f));
  m.title = $("editTitleInput").value.trim();
  m.message = $("editMessageInput").value.trim();
  m.song = $("editSongInput").value.trim();
  m.updatedAt = Date.now();
  await putMemory(m);
  $("editPhotosInput").value = "";
  toast("Đã lưu thay đổi");
  await openMemory(currentId);
});

$("deleteBtn").onclick = async () => {
  if (!confirm("Xóa Memory này khỏi thiết bị?")) return;
  await deleteMemory(currentId);
  currentId = null;
  history.replaceState({}, "", location.pathname);
  toast("Đã xóa Memory");
  await renderHome();
};

$("photosInput").addEventListener("change", e => handleCreateFiles(e.target.files));
$("unlockBtn").onclick = unlockEdit;
$("editPinInput").addEventListener("keydown", e => { if (e.key === "Enter") unlockEdit(); });

function goCreate() {
  showView("createView");
  $("createForm").reset();
  stagedCreatePhotos = [];
  renderCreatePreview();
}
$("startBtn").onclick = goCreate;
$("newBtn").onclick = goCreate;
$("homeBtn").onclick = () => {
  history.replaceState({}, "", location.pathname);
  renderHome();
};

(async function init(){
  db = await openDB();
  const params = new URLSearchParams(location.search);
  const id = params.get("m");
  if (id) await openMemory(id);
  else await renderHome();
})();
