// Shared online storage (Supabase) — one database for all PDCA apps.
// The publishable key is public by design: access is enforced by the
// Row Level Security rules defined in supabase/schema.sql.
const PDCA_CONFIG = {
  supabaseUrl: "https://adjwqexqohflcvhzecyt.supabase.co",
  supabaseKey: "sb_publishable_r593WzAVqr4c5At1VSDn2Q_vbicn7Yo",
  photoBucket: "pdca-photos",
  photoMaxSide: 1600,
  photoQuality: 0.82,
  maxPhotos: 6,
  // SHA-256 of the technician entry password
  entryPinHash: "fb363655ec3dc201f91e04702997a0528c4989bb109951f7fc4f842b5a6af7e7",
};

const PDCA_DB = (function () {
  "use strict";

  const cfg = PDCA_CONFIG;
  const client = window.supabase && window.supabase.createClient
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey)
    : null;

  function must(res) {
    if (res.error) throw res.error;
    return res.data;
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function photoUrl(path) {
    if (/^(https?:|data:|blob:|assets\/)/.test(path)) return path;
    return `${cfg.supabaseUrl}/storage/v1/object/public/${cfg.photoBucket}/${path}`;
  }

  // ---------- Photos ----------
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image illisible")); };
      img.src = url;
    });
  }

  async function compress(file) {
    const img = await loadImage(file);
    const scale = Math.min(1, cfg.photoMaxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", cfg.photoQuality));
  }

  async function uploadPhotos(files, folder, onProgress) {
    const paths = [];
    for (let i = 0; i < files.length; i++) {
      onProgress && onProgress(i + 1, files.length);
      const blob = await compress(files[i]);
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      must(await client.storage.from(cfg.photoBucket).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" }));
      paths.push(path);
    }
    return paths;
  }

  async function removePhotos(paths) {
    const own = (paths || []).filter((p) => !/^(https?:|assets\/)/.test(p));
    if (own.length) must(await client.storage.from(cfg.photoBucket).remove(own));
  }

  // ---------- Data ----------
  async function loadProject(project) {
    const [anomalies, interventions] = await Promise.all([
      client.from("anomalies").select("*").eq("project", project).order("created_at", { ascending: true }),
      client.from("interventions").select("*").eq("project", project).order("performed_on", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    return { anomalies: must(anomalies), interventions: must(interventions) };
  }

  const insert = async (table, row) => must(await client.from(table).insert(row).select().single());
  const update = async (table, id, patch) =>
    must(await client.from(table).update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select().single());
  const remove = async (table, id) => must(await client.from(table).delete().eq("id", id));

  function subscribe(project, onChange) {
    const channel = client.channel(`pdca-${project}`);
    ["anomalies", "interventions"].forEach((table) =>
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `project=eq.${project}` }, onChange)
    );
    channel.subscribe();
    return channel;
  }

  // ---------- Admin auth ----------
  async function isAdmin() {
    const { data } = await client.auth.getSession();
    if (!data.session) return false;
    const res = await client.rpc("is_admin");
    return !res.error && res.data === true;
  }
  const signIn = async (email, password) => must(await client.auth.signInWithPassword({ email, password }));
  const signOut = () => client.auth.signOut();
  const onAuthChange = (cb) => client.auth.onAuthStateChange(() => setTimeout(cb, 0));

  return {
    available: !!client,
    uuid,
    photoUrl,
    uploadPhotos,
    removePhotos,
    loadProject,
    insert,
    update,
    remove,
    subscribe,
    isAdmin,
    signIn,
    signOut,
    onAuthChange,
  };
})();
