// Memo - 심플 개인 메모장 앱 로직
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const storageKey = "memo_app_data_v1";

  // ---------- 상태 ----------
  const state = {
    locked: true,
    passwordHash: null, // 저장된 비밀번호 해시
    notes: [], // 메모 배열
    editingId: null, // 현재 수정 중인 메모 id
  };

  // ---------- 간단한 해시 (SHA-256 기반) ----------
  async function hashPassword(raw) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // ---------- 저장 ----------
  function load() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return false;
      const data = JSON.parse(raw);
      state.passwordHash = data.passwordHash || null;
      state.notes = Array.isArray(data.notes) ? data.notes : [];
      return true;
    } catch {
      return false;
    }
  }

  function save() {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        passwordHash: state.passwordHash,
        notes: state.notes,
      })
    );
  }

  // ---------- 비밀번호 ----------
  async function setPassword(raw) {
    state.passwordHash = await hashPassword(raw);
    state.notes = [];
    save();
  }

  async function verifyPassword(raw) {
    if (!state.passwordHash) return false;
    const computed = await hashPassword(raw);
    return computed === state.passwordHash;
  }

  // ---------- 메모 유틸 ----------
  function noteId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function formattedDate(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}.${m}.${day} ${hh}:${mm}`;
  }

  function preview(text, len = 90) {
    if (!text) return "";
    return text.replace(/\s+/g, " ").slice(0, len);
  }

  // ---------- 메모 CRUD ----------
  function createNote(title, body) {
    const note = {
      id: noteId(),
      title: title.trim() || "",
      body: body.trim() || "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    state.notes.unshift(note);
    save();
    return note;
  }

  function updateNote(id, title, body) {
    const idx = state.notes.findIndex((n) => n.id === id);
    if (idx === -1) return null;
    const note = state.notes[idx];
    note.title = title.trim() || note.title;
    note.body = body.trim() || note.body;
    note.updatedAt = Date.now();
    save();
    return note;
  }

  function deleteNote(id) {
    state.notes = state.notes.filter((n) => n.id !== id);
    save();
  }

  function findNote(id) {
    return state.notes.find((n) => n.id === id);
  }

  // ---------- 화면 전환 ----------
  function showLock() {
    $("#lock").hidden = false;
    $("#memo-screen").hidden = true;
    state.locked = true;
  }

  function showMemo() {
    $("#lock").hidden = true;
    $("#memo-screen").hidden = false;
    state.locked = false;
    renderList();
  }

  // ---------- 잠금 화면 ----------
  function initLock() {
    const form = $("#lock-form");
    const error = $("#lock-error");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = $("#lock-input");
      const raw = input.value.trim();
      if (!raw) {
        error.hidden = false;
        return;
      }
      error.hidden = true;

      if (!state.passwordHash) {
        await setPassword(raw);
        input.value = "";
        showMemo();
        return;
      }

      const ok = await verifyPassword(raw);
      if (!ok) {
        error.hidden = false;
        input.value = "";
        input.focus();
        return;
      }

      input.value = "";
      showMemo();
    });
  }

  // ---------- 메모 목록 ----------
  function renderList() {
    const list = $("#memo-list");
    const empty = $("#memo-empty");

    if (!state.notes.length) {
      list.innerHTML = "";
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    list.innerHTML = state.notes
      .map(
        (n) => `
      <li class="memo-card" data-id="${n.id}">
        <h3 class="memo-card-title ${n.title ? '' : 'empty-title-msg'}">${n.title || '제목 없음'}</h3>
        <p class="memo-card-body">${esc(preview(n.body))}</p>
        <div class="memo-card-meta">
          <span class="memo-card-date">${formattedDate(n.updatedAt || n.createdAt)}</span>
          <span class="memo-card-actions">
            <button type="button" data-action="edit" aria-label="수정">수정</button>
            <button type="button" data-action="delete" aria-label="삭제">삭제</button>
          </span>
        </div>
      </li>
    `
      )
      .join("");

    $$(".memo-card", list).forEach((card) => {
      const id = card.dataset.id;

      card.addEventListener("click", (e) => {
        if (e.target.closest("[data-action]")) return;
        openEditor(id);
      });

      card.querySelector('[data-action="edit"]').addEventListener("click", (e) => {
        e.stopPropagation();
        openEditor(id);
      });

      card.querySelector('[data-action="delete"]').addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm("이 메모를 삭제하시겠어요?")) {
          deleteNote(id);
          renderList();
        }
      });
    });
  }

  // ---------- 메모 에디터 ----------
  function openEditor(id) {
    const note = id ? findNote(id) : null;
    state.editingId = id;

    $("#field-title").value = note ? note.title : "";
    $("#field-body").value = note ? note.body : "";
    $("#modal-title").textContent = note ? "메모 수정" : "새 메모";
    $("#btn-delete").hidden = !note;

    updateCount();
    $("#modal-backdrop").hidden = false;
    $("#field-title").focus();
  }

  function closeEditor() {
    $("#modal-backdrop").hidden = true;
    state.editingId = null;
  }

  function updateCount() {
    const body = $("#field-body").value;
    $("#field-count").textContent = body.length;
  }

  function handleSave(e) {
    e.preventDefault();
    const title = $("#field-title").value.trim();
    const body = $("#field-body").value.trim();

    if (!state.editingId) {
      createNote(title, body);
    } else {
      updateNote(state.editingId, title, body);
    }

    closeEditor();
    renderList();
  }

  function handleDelete() {
    if (!state.editingId) return;
    if (confirm("이 메모를 삭제하시겠어요?")) {
      deleteNote(state.editingId);
      closeEditor();
      renderList();
    }
  }

  // ---------- 유틸 ----------
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ---------- 초기 바인딩 ----------
  function initMemo() {
    $("#btn-new").addEventListener("click", () => openEditor(null));
    $("#btn-modal-close").addEventListener("click", closeEditor);
    $("#btn-delete").addEventListener("click", handleDelete);
    $("#memo-form").addEventListener("submit", handleSave);

    const backdrop = $("#modal-backdrop");
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeEditor();
    });

    $("#field-body").addEventListener("input", updateCount);
    $("#btn-lock").addEventListener("click", () => {
      showLock();
      $("#lock-input").focus();
    });
  }

  // ---------- 진입 ----------
  function init() {
    load();
    initLock();
    initMemo();

    if (state.passwordHash) {
      showLock();
    } else {
      showLock();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
