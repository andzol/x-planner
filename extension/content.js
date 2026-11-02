// Adds a "Schedule" button left of X's Post button. It sends the composer's text and media to the
// background worker, which drops the post into the next free X Planner slot.
(() => {
  const POST_BTNS = '[data-testid="tweetButton"], [data-testid="tweetButtonInline"]';
  // calendar with a clock
  const ICON = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h5"/><path d="M16 2v4M8 2v4M3 10h18"/><circle cx="17.5" cy="17.5" r="4.5"/><path d="M17.5 15.5v2l1.3 1.1"/></svg>';

  function toast(html, err = false) {
    document.querySelector(".xps-toast")?.remove();
    const t = document.createElement("div");
    t.className = "xps-toast" + (err ? " err" : "");
    t.innerHTML = html;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), err ? 9000 : 7000);
  }

  // smallest ancestor of the Post button that also holds the text box
  function composerOf(btn) {
    let el = btn;
    while (el && !el.querySelector?.('[data-testid="tweetTextarea_0"]')) el = el.parentElement;
    return el;
  }

  async function toB64(url) {
    const blob = await (await fetch(url)).blob();
    const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(",")[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
    return { type: blob.type || "image/jpeg", data };
  }

  function clickByText(text) {
    const b = [...document.querySelectorAll('[role="button"], button')].find((x) => x.innerText.trim() === text);
    b?.click();
    return !!b;
  }

  async function onSchedule(ev) {
    ev.preventDefault(); ev.stopPropagation();
    const btn = ev.currentTarget;
    const root = composerOf(btn);
    if (!root) return toast("Couldn't find the composer", true);
    if (root.querySelectorAll('[data-testid^="tweetTextarea_"]').length > 1) return toast("Threads aren't supported yet, schedule one post at a time", true);
    const text = (root.querySelector('[data-testid="tweetTextarea_0"]')?.innerText || "").replace(/​/g, "").replace(/\s+$/, "");
    const att = root.querySelector('[data-testid="attachments"]');
    const urls = att ? [...att.querySelectorAll("video[src], img[src]")].map((m) => m.src).filter((u) => u.startsWith("blob:") || u.startsWith("data:")) : [];
    if (!text.trim() && !urls.length) return toast("Nothing to schedule yet", true);
    btn.disabled = true; btn.classList.add("busy");
    try {
      const media = [];
      for (const u of urls) media.push(await toB64(u));
      const r = await chrome.runtime.sendMessage({ type: "xps-schedule", text, media });
      if (!r?.ok) throw new Error(r?.error || "no reply from the extension");
      const when = new Date(r.date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
      toast(`Scheduled for <b>${when}, ${r.slot}</b> (${r.timezone.split("/")[1]}) · <a href="${r.planner}" target="_blank" rel="noopener">open planner</a>`);
      // modal composer: close it and discard the local copy; the planner has the post now
      const dialog = btn.closest('[role="dialog"]');
      if (dialog) {
        document.querySelector('[data-testid="app-bar-close"]')?.click();
        setTimeout(() => clickByText("Discard"), 400);
      }
    } catch (e) {
      toast("Schedule failed: " + e.message, true);
    } finally {
      btn.disabled = false; btn.classList.remove("busy");
    }
  }

  // only the "What's happening?" pop-up for a brand new post: replies and quotes show the
  // original tweet (it has a <time> and a /status/ link), the inline Home and reply boxes have no dialog
  function isNewPostComposer(post) {
    const dialog = post.closest('[role="dialog"]');
    return !!dialog && !dialog.querySelector('time, a[href*="/status/"], [data-testid="tweet"]');
  }

  function inject() {
    for (const post of document.querySelectorAll(POST_BTNS)) {
      // X stacks its Post button in a column wrapper, so the Schedule button goes beside that wrapper
      const slot = post.parentElement, row = slot?.parentElement;
      const mine = row?.querySelector(":scope > .xps-btn");
      const want = isNewPostComposer(post);
      if (!want) { mine?.remove(); continue; }
      if (mine || !row) continue;
      const b = document.createElement("button");
      b.type = "button"; b.className = "xps-btn"; b.innerHTML = ICON;
      b.title = "Schedule: put this post into the next free X Planner slot";
      b.setAttribute("aria-label", "Schedule");
      b.addEventListener("click", onSchedule);
      row.insertBefore(b, slot.nextSibling);
    }
  }

  new MutationObserver(inject).observe(document.documentElement, { childList: true, subtree: true });
  inject();
})();
