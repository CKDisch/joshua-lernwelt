(() => {
  const project = "https://onryzqckzfofwdlqdqza.supabase.co";
  const publishableKey = "sb_publishable_AHiNacgboJT1e_OXdh4mdA_qHxdgdTh";
  const site = new URL("./index.html", document.baseURI).href;
  const keys = ["jl-progress-v1", "jl-settings-v1", "jl-deutsch-migrated-v1",
    "jl-deutsch-skills-v1", "joshua-deutsch-focus-v2", "politique-scores-v1",
    "politique-journal-v1", "jl-answer-history-v1"];
  const client = window.supabase?.createClient(project, publishableKey);
  const root = document.createElement("details");
  root.className = "lern-account";
  root.innerHTML = '<summary></summary><form hidden><label></label><input type="email" autocomplete="email" required><button></button></form><button type="button" data-sync hidden></button> <button type="button" data-logout hidden></button><p role="status"></p>';
  document.querySelector("main").prepend(root);
  const fr = document.documentElement.lang === "fr";
  const label = (de, french) => fr ? french : de;
  const form = root.querySelector("form");
  const email = form.querySelector("input");
  const sync = root.querySelector("[data-sync]");
  const logout = root.querySelector("[data-logout]");
  const status = message => { root.querySelector("[role=status]").textContent = message; };
  root.querySelector("summary").textContent = label("Lernkonto · Geräte synchronisieren", "Compte · Synchroniser les appareils");
  root.querySelector("label").textContent = label("E-Mail-Adresse", "Adresse e-mail");
  email.id = "learn-email";
  root.querySelector("label").htmlFor = email.id;
  form.querySelector("button").textContent = label("Anmeldelink senden", "Envoyer le lien de connexion");
  sync.textContent = label("Jetzt synchronisieren", "Synchroniser maintenant");
  logout.textContent = label("Abmelden", "Se déconnecter");

  let user = null, timer, syncing, retry = false;
  let cache = { base: {}, data: {} };
  const accountKey = () => "jl-account-v1:" + user.id;
  const read = key => {
    const raw = localStorage.getItem(key);
    if (raw === null) return undefined;
    try { return JSON.parse(raw); } catch { return raw; }
  };
  const guestData = () => Object.fromEntries(keys.flatMap(key => {
    const value = read(key);
    return value === undefined ? [] : [[key, value]];
  }));
  const save = () => localStorage.setItem(accountKey(), JSON.stringify(cache));
  function guestStorage(key) {
    return localStorage.getItem(key);
  }
  window.lernStorage = {
    getItem(key) {
      if (!user) return guestStorage(key);
      if (!Object.hasOwn(cache.data, key)) return null;
      return key === "jl-deutsch-migrated-v1" ? String(cache.data[key]) : JSON.stringify(cache.data[key]);
    },
    setItem(key, value) {
      if (!keys.includes(key)) throw new Error("Unknown progress key");
      if (!user) {
        localStorage.setItem(key, value);
        return;
      }
      cache.data[key] = JSON.parse(value);
      save();
      clearTimeout(timer);
      timer = setTimeout(() => void pull(), 600);
    }
  };

  const historyKey = "jl-answer-history-v1";
  const journal = () => JSON.parse(lernStorage.getItem(historyKey) || '{"attempts":[],"drafts":{}}');
  const journalPanel = document.createElement("details");
  if (!fr) {
    journalPanel.className = "lern-account";
    const heading = document.createElement("summary");
    heading.textContent = "Meine Antworten und Musterlösungen";
    journalPanel.append(heading);
    document.querySelector("main").append(journalPanel);
  }
  function renderJournal() {
    if (!journalPanel.open) return;
    while (journalPanel.children.length > 1) journalPanel.lastElementChild.remove();
    const data = journal();
    const text = (parent, tag, value) => {
      const node = document.createElement(tag);
      node.textContent = value;
      parent.append(node);
    };
    if (!data.attempts.length && !Object.keys(data.drafts).length) text(journalPanel,"p","Noch keine Antworten gespeichert.");
    for (const entry of data.attempts.slice().reverse()) {
      const details = document.createElement("details");
      details.className = "lern-attempt";
      const outcome = entry.ok === undefined ? "offen" : entry.ok ? "richtig / gelungen" : "noch üben";
      text(details,"summary",entry.subject+" · "+entry.type+" · "+outcome+" · "+entry.question);
      text(details,"p","Deine Antwort: "+(entry.response || "—"));
      if (entry.model) text(details,"p","Lösung oder Erklärung: "+entry.model);
      journalPanel.append(details);
    }
  }
  const saveJournal = data => {
    lernStorage.setItem(historyKey,JSON.stringify(data));
    renderJournal();
  };
  window.lernJournal = {
    draft(key, value) {
      const data = journal();
      if (value === undefined) return data.drafts[key] || "";
      if (value.trim()) data.drafts[key] = value;
      else delete data.drafts[key];
      saveJournal(data);
    },
    add(key,subject,question,response,model,type,ok) {
      const data = journal();
      const id = crypto.randomUUID();
      data.attempts.push({id,key,subject,question,response,model,type,ok,date:new Date().toISOString()});
      if (ok !== undefined) delete data.drafts[key];
      saveJournal(data);
      return id;
    },
    grade(id,ok) {
      const data = journal();
      const entry = data.attempts.find(item=>item.id===id);
      if (!entry) return;
      entry.ok = ok;
      delete data.drafts[entry.key];
      saveJournal(data);
    }
  };
  journalPanel.ontoggle = renderJournal;
  window.addEventListener("lern-progress",renderJournal);

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const object = value => !!value && typeof value === "object" && !Array.isArray(value);
  function merge(base, local, remote, field) {
    if (same(base, local)) return remote;
    if (same(base, remote)) return local;
    if ((field === "right" || field === "wrong") && typeof local === "number" && typeof remote === "number") {
      return Math.max(0, remote + local - (base || 0));
    }
    if (Array.isArray(local) && Array.isArray(remote)) {
      if (field === "attempts") {
        const previous = new Map((base || []).map(item => [item.id,item]));
        const merged = new Map(remote.map(item => [item.id,item]));
        for (const item of local) {
          if (!same(previous.get(item.id), item)) merged.set(item.id, item);
        }
        return [...merged.values()].sort((a,b) => a.date.localeCompare(b.date));
      }
      if (!base) return [...remote, ...local].slice(-3);
      for (let overlap=Math.min(base.length, local.length); overlap>=0; overlap--) {
        if (same(base.slice(base.length-overlap), local.slice(0,overlap))) {
          return [...remote, ...local.slice(overlap)].slice(-3);
        }
      }
    }
    if (object(local) && object(remote)) {
      const fields = new Set([...Object.keys(base || {}), ...Object.keys(local), ...Object.keys(remote)]);
      return Object.fromEntries([...fields].flatMap(key => {
        const item = merge(base?.[key], local[key], remote[key], key);
        return item === undefined ? [] : [[key, item]];
      }));
    }
    return local;
  }
  async function syncAccount() {
    const id = user.id;
    const table = () => client.from("lernwelt_progress");
    for (let attempt=0; attempt<4; attempt++) {
      const { data: row, error } = await table().select("revision,progress").eq("user_id",id)
        .abortSignal(AbortSignal.timeout(7000)).maybeSingle();
      if (error) throw error;
      const snapshot = structuredClone(cache.data);
      const remote = row?.progress || {};
      const next = merge(cache.base, snapshot, remote);
      if (!same(remote,next)) {
        const request = row
          ? table().update({revision:row.revision+1, progress:next}).eq("user_id",id).eq("revision",row.revision)
          : table().insert({user_id:id,progress:next});
        const { data, error: writeError } = await request.select("revision").abortSignal(AbortSignal.timeout(7000)).maybeSingle();
        if (writeError && writeError.code !== "23505") throw writeError;
        if (!data) continue;
      }
      cache.data = merge(snapshot, cache.data, next);
      cache.base = structuredClone(next);
      save();
      window.dispatchEvent(new Event("lern-progress"));
      if (!same(cache.data, cache.base)) retry = true;
      return;
    }
    throw new Error("Concurrent update");
  }
  function pull() {
    if (!user) return Promise.resolve();
    if (syncing) {
      retry = true;
      return syncing;
    }
    status(label("Lernstand wird synchronisiert …", "Synchronisation en cours …"));
    syncing = syncAccount().then(() => {
      status(label("Lernstand synchronisiert.", "Progrès synchronisé."));
    }).catch(() => {
      status(label("Lernstand auf diesem Gerät gespeichert. Synchronisierung wird erneut versucht.", "Progrès enregistré sur cet appareil. Une nouvelle tentative suivra."));
    }).finally(() => {
      syncing = null;
      if (retry) {
        retry = false;
        clearTimeout(timer);
        timer = setTimeout(() => void pull(), 800);
      }
    });
    return syncing;
  }
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const { error } = await client.auth.signInWithOtp({email:email.value.trim(), options:{emailRedirectTo:site}});
      status(error
        ? label("Anmeldelink konnte nicht gesendet werden. Prüfe E-Mail-Adresse und Mailversand.", "Échec de l’envoi. Vérifie l’adresse et le service d’envoi.")
        : label("Öffne den Link aus der E-Mail auf diesem Gerät.", "Ouvre le lien reçu par e-mail sur cet appareil."));
    } catch {
      status(label("Verbindung fehlgeschlagen. Bitte erneut versuchen.", "Connexion impossible. Réessaie."));
    } finally {
      button.disabled = false;
    }
  };
  sync.onclick = () => void pull();
  logout.onclick = async () => {
    logout.disabled = true;
    await pull();
    const {error} = await client.auth.signOut({scope:"local"});
    if (error) {
      status(label("Abmeldung fehlgeschlagen.", "La déconnexion a échoué."));
      logout.disabled = false;
    } else location.replace(site);
  };
  window.addEventListener("online", () => void pull());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void pull(); });
  setInterval(() => { if (!document.hidden) void pull(); }, 15000);

  window.lernReady = (async () => {
    if (!client) {
      status(label("Anmeldung ist gerade nicht verfügbar.", "La connexion est indisponible."));
      return;
    }
    const {data, error} = await client.auth.getSession();
    user = data?.session?.user || null;
    form.hidden = !!user;
    sync.hidden = logout.hidden = !user;
    if (!user) {
      status(label("Ohne Anmeldung wird auf diesem Gerät gespeichert.", "Sans connexion, les progrès restent sur cet appareil."));
      if (error) root.open = true;
      return;
    }
    cache = read(accountKey()) || {base:{},data:guestData()};
    root.open = true;
    await pull();
  })().catch(() => status(label("Lernkonto konnte nicht geladen werden.", "Impossible de charger le compte.")));
})();
