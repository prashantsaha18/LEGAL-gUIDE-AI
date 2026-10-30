(() => {
  "use strict";

  const STORE_KEY = "legalguide.chats.v1";
  const API_URL = "/api/chat";

  const $ = (sel) => document.querySelector(sel);
  const el = {
    app: $(".app"),
    stream: $("#stream"),
    messages: $("#messages"),
    form: $("#composer"),
    input: $("#input"),
    send: $("#send"),
    list: $("#chatList"),
    sidebar: $("#sidebar"),
    scrim: $("#scrim"),
    title: $("#chatTitle"),
    newChat: $("#newChat"),
    menuBtn: $("#menuBtn"),
  };

  let chats = loadChats();
  let activeId = null;
  let busy = false;

  /* ---------- storage ---------- */
  function loadChats() {
    try {
      const data = JSON.parse(localStorage.getItem(STORE_KEY));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }
  function saveChats() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(chats.slice(0, 40)));
    } catch {
      /* storage unavailable: chat still works for this session */
    }
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const activeChat = () => chats.find((c) => c.id === activeId) || null;

  /* ---------- safe, minimal markdown ---------- */
  function esc(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function inline(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>");
  }
  function markdown(text) {
    let html = "";
    let list = null;
    const close = () => {
      if (list) { html += `</${list}>`; list = null; }
    };
    for (const raw of text.split("\n")) {
      const line = raw.trimEnd();
      let m;
      if (!line.trim()) { close(); continue; }
      if ((m = line.match(/^#{1,4}\s+(.*)/))) {
        close(); html += `<h4>${inline(m[1])}</h4>`;
      } else if ((m = line.match(/^\s*[-*•]\s+(.*)/))) {
        if (list !== "ul") { close(); html += "<ul>"; list = "ul"; }
        html += `<li>${inline(m[1])}</li>`;
      } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) {
        if (list !== "ol") { close(); html += "<ol>"; list = "ol"; }
        html += `<li>${inline(m[1])}</li>`;
      } else {
        close(); html += `<p>${inline(line)}</p>`;
      }
    }
    close();
    return html;
  }

  /* ---------- rendering ---------- */
  const BOT_ICON =
    '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5v20M9 25h14M16 8 8 9m8-1 8 1M8 9l-3 7a3 3 0 0 0 6 0L8 9Zm16 0-3 7a3 3 0 0 0 6 0l-3-7Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function messageNode(m) {
    const row = document.createElement("div");
    row.className = "msg " + (m.role === "user" ? "user" : "bot") + (m.error ? " error" : "");

    if (m.role === "user") {
      row.innerHTML = '<div class="bubble"></div>';
      row.querySelector(".bubble").textContent = m.content;
      return row;
    }

    row.innerHTML = `<div class="avatar">${BOT_ICON}</div><div class="bubble"></div>`;
    const bubble = row.querySelector(".bubble");
    bubble.innerHTML = markdown(m.content);

    if (!m.error) {
      const actions = document.createElement("div");
      actions.className = "bubble-actions";
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "copy-btn";
      copy.textContent = "Copy";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(m.content);
          copy.textContent = "Copied";
          setTimeout(() => (copy.textContent = "Copy"), 1500);
        } catch {
          copy.textContent = "Copy failed";
        }
      });
      actions.appendChild(copy);
      bubble.appendChild(actions);
    }
    return row;
  }

  function typingNode() {
    const row = document.createElement("div");
    row.className = "msg bot";
    row.id = "typing";
    row.innerHTML = `<div class="avatar">${BOT_ICON}</div><div class="bubble"><span class="typing" role="status" aria-label="LegalGuide AI is writing"><i></i><i></i><i></i></span></div>`;
    return row;
  }

  function renderMessages() {
    const chat = activeChat();
    el.messages.replaceChildren();
    const has = !!(chat && chat.messages.length);
    el.app.classList.toggle("is-chatting", has);
    el.title.textContent = chat ? chat.title : "New conversation";
    if (has) chat.messages.forEach((m) => el.messages.appendChild(messageNode(m)));
    scrollToEnd();
  }

  function renderList() {
    el.list.replaceChildren();
    if (!chats.length) {
      const p = document.createElement("p");
      p.className = "chat-empty";
      p.textContent = "Your conversations will appear here.";
      el.list.appendChild(p);
      return;
    }
    [...chats]
      .sort((a, b) => b.updated - a.updated)
      .forEach((c) => {
        const item = document.createElement("div");
        item.className = "chat-item" + (c.id === activeId ? " active" : "");

        const open = document.createElement("button");
        open.type = "button";
        open.className = "chat-open";
        open.textContent = c.title;
        open.addEventListener("click", () => { activeId = c.id; refresh(); closeMenu(); });

        const del = document.createElement("button");
        del.type = "button";
        del.className = "chat-del";
        del.setAttribute("aria-label", "Delete conversation: " + c.title);
        del.textContent = "\u00d7";
        del.addEventListener("click", () => {
          chats = chats.filter((x) => x.id !== c.id);
          if (activeId === c.id) activeId = null;
          saveChats(); refresh();
        });

        item.append(open, del);
        el.list.appendChild(item);
      });
  }

  function refresh() { renderList(); renderMessages(); }
  function scrollToEnd() { el.stream.scrollTop = el.stream.scrollHeight; }

  /* ---------- sending ---------- */
  function setBusy(v) {
    busy = v;
    el.send.disabled = v || !el.input.value.trim();
    el.input.disabled = v;
    if (!v) el.input.focus();
  }

  async function send(text) {
    text = text.trim();
    if (!text || busy) return;

    let chat = activeChat();
    if (!chat) {
      chat = { id: uid(), title: text.length > 48 ? text.slice(0, 48) + "\u2026" : text, messages: [], updated: Date.now() };
      chats.unshift(chat);
      activeId = chat.id;
    }
    chat.messages.push({ role: "user", content: text });
    chat.updated = Date.now();
    saveChats();
    el.input.value = "";
    autoGrow();
    refresh();

    setBusy(true);
    el.messages.appendChild(typingNode());
    scrollToEnd();

    try {
      const history = chat.messages
        .filter((m) => !m.error)
        .slice(-16)
        .map(({ role, content }) => ({ role, content }));

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.reply) throw new Error(data.error || `The request failed (status ${res.status}). Please try again.`);
      chat.messages.push({ role: "assistant", content: data.reply });
    } catch (err) {
      const offline = !navigator.onLine;
      chat.messages.push({
        role: "assistant",
        error: true,
        content: offline ? "You appear to be offline. Check your connection and send again." : err.message,
      });
    } finally {
      chat.updated = Date.now();
      saveChats();
      setBusy(false);
      refresh();
    }
  }

  /* ---------- composer ---------- */
  function autoGrow() {
    el.input.style.height = "auto";
    el.input.style.height = Math.min(el.input.scrollHeight, 180) + "px";
    el.send.disabled = busy || !el.input.value.trim();
  }
  el.input.addEventListener("input", autoGrow);
  el.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send(el.input.value);
    }
  });
  el.form.addEventListener("submit", (e) => { e.preventDefault(); send(el.input.value); });

  document.querySelectorAll(".topic").forEach((btn) =>
    btn.addEventListener("click", () => send(btn.dataset.q))
  );

  /* ---------- sidebar ---------- */
  function openMenu() { el.sidebar.classList.add("open"); el.scrim.hidden = false; }
  function closeMenu() { el.sidebar.classList.remove("open"); el.scrim.hidden = true; }
  el.menuBtn.addEventListener("click", openMenu);
  el.scrim.addEventListener("click", closeMenu);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
  el.newChat.addEventListener("click", () => { activeId = null; refresh(); closeMenu(); el.input.focus(); });

  refresh();
})();
