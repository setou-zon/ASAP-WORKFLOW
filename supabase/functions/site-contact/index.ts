// Formulaires du site (contact et inscription aux cours) : anti-robot Turnstile,
// limitation du nombre d'envois, enregistrement sécurisé et e-mail à l'administrateur.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { APP_URL, button, esc, json, cors, layout, sendMail } from "./common.ts";

const LIM = { nom: 120, email: 160, entreprise: 160, telephone: 40, sujet: 80, secteur: 80, message: 3000, cours: 200, parcours: 60 };
type Field = keyof typeof LIM;

async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Méthode non autorisée" }, 405);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json(req, { error: "Requête invalide" }, 400); }

  if (String(b.site_web ?? "").length) return json(req, { ok: true });   // piège à robots

  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  // 1. Anti-robot Cloudflare Turnstile
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (secret) {
    const form = new FormData();
    form.append("secret", secret); form.append("response", String(b.token ?? "")); if (ip) form.append("remoteip", ip);
    const v = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form }).then((r) => r.json()).catch(() => ({ success: false }));
    if (!v.success) return json(req, { error: "La vérification anti-robot a échoué. Rechargez la page et réessayez." }, 403);
  }
  // 2. Validation des champs
  const d: Record<string, string> = {};
  for (const k of Object.keys(LIM) as Field[]) d[k] = String(b[k] ?? "").trim().slice(0, LIM[k]);
  const kind = b.type === "inscription" ? "inscription" : "contact";
  if (!d.nom || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return json(req, { error: "Nom et e-mail valides requis." }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  // 3. Limite : 5 envois par heure et par connexion
  const ipHash = await sha256(ip + "|asap");
  const { count } = await admin.from("leads").select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash).gte("created_at", new Date(Date.now() - 3600 * 1000).toISOString());
  if ((count ?? 0) >= 5) return json(req, { error: "Trop d'envois depuis cette connexion. Réessayez dans une heure." }, 429);

  const { error } = await admin.from("leads").insert({ kind, ...d, ip_hash: ipHash });
  if (error) return json(req, { error: "Enregistrement impossible pour le moment." }, 500);

  // 4. E-mail à l'administrateur (réponse directe possible au visiteur)
  const { data: admins } = await admin.from("platform_admins").select("user_id");
  const ids = (admins ?? []).map((a) => a.user_id);
  const { data: ap } = ids.length ? await admin.from("profiles").select("email").in("id", ids) : { data: [] };
  const to = (ap ?? []).map((a) => a.email).filter(Boolean) as string[];
  if (to.length) {
    const rows = ([["Nom", d.nom], ["E-mail", d.email], ["Entreprise", d.entreprise], ["Téléphone", d.telephone], ["Besoin", d.sujet], ["Secteur", d.secteur], ["Cours", d.cours], ["Parcours", d.parcours]] as [string, string][])
      .filter(([, v]) => v).map(([k, v]) => `<tr><td style="color:#5b6577;padding-right:14px;vertical-align:top">${k}</td><td>${esc(v)}</td></tr>`).join("");
    const html = layout(kind === "inscription" ? "Nouvelle inscription à un cours" : "Nouvelle demande depuis le site",
      `<table style="font-size:16px;line-height:1.7">${rows}</table>${d.message ? `<p style="white-space:pre-wrap;border-left:3px solid #e2e8f0;padding-left:12px">${esc(d.message)}</p>` : ""}
       <p>Répondez directement à cet e-mail pour écrire à ${esc(d.nom)}.</p>${button(APP_URL, "Voir toutes les demandes")}`);
    await sendMail(to, kind === "inscription" ? `Inscription : ${d.cours || "cours"} (${d.nom})` : `Demande site : ${d.sujet || "contact"} (${d.nom})`, html, d.email);
  }
  return json(req, { ok: true });
});
