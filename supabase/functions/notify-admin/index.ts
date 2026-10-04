// Prévient l'administrateur qu'un nouveau compte attend sa validation.
// Appelé par l'application juste après une inscription. Un seul e-mail par compte.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { APP_URL, button, esc, json, cors, layout, sendMail } from "./common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, { ok: true });
  let email = "";
  try { email = String((await req.json()).email ?? "").trim().toLowerCase().slice(0, 160); } catch { /* ignoré */ }
  if (!email) return json(req, { ok: true });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const since = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const { data: claimed } = await admin.from("profiles")
    .update({ admin_notified_at: new Date().toISOString() })
    .eq("email", email).eq("status", "pending").is("admin_notified_at", null).gte("created_at", since)
    .select("full_name, email, organization, created_at");
  const p = claimed?.[0];
  if (!p) return json(req, { ok: true });

  const { data: admins } = await admin.from("platform_admins").select("user_id");
  const ids = (admins ?? []).map((a) => a.user_id);
  const { data: adminProfiles } = ids.length ? await admin.from("profiles").select("email").in("id", ids) : { data: [] };
  const to = (adminProfiles ?? []).map((a) => a.email).filter(Boolean) as string[];
  if (!to.length) return json(req, { ok: true });

  const html = layout("Nouveau compte en attente de validation",
    `<p>Une nouvelle personne s'est inscrite sur l'application de suivi :</p>
     <table style="font-size:16px;line-height:1.7">
       <tr><td style="color:#5b6577;padding-right:14px">Nom</td><td><b>${esc(p.full_name || "-")}</b></td></tr>
       <tr><td style="color:#5b6577;padding-right:14px">E-mail</td><td>${esc(p.email)}</td></tr>
       <tr><td style="color:#5b6577;padding-right:14px">Organisation</td><td>${esc(p.organization || "-")}</td></tr>
     </table>
     <p>Ce compte n'a accès à aucune donnée tant que vous ne l'avez pas activé.</p>
     ${button(APP_URL, "Valider ou refuser le compte")}`);
  await sendMail(to, `Nouveau compte à valider : ${p.full_name || p.email}`, html, p.email ?? undefined);
  return json(req, { ok: true });
});
