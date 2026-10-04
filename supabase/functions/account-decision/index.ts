// Activation / refus / suspension d'un compte par l'administrateur de la plateforme.
// Les droits sont vérifiés par la base (fonction admin_set_account_status) avec le jeton de l'appelant.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { APP_URL, button, esc, json, cors, layout, sendMail } from "./common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Méthode non autorisée" }, 405);
  const auth = req.headers.get("Authorization") ?? "";
  let body: { user_id?: string; status?: string };
  try { body = await req.json(); } catch { return json(req, { error: "Requête invalide" }, 400); }
  if (!body.user_id || !body.status) return json(req, { error: "Paramètres manquants" }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await sb.rpc("admin_set_account_status", { target: body.user_id, new_status: body.status });
  if (error) return json(req, { error: error.message }, 403);
  const row = Array.isArray(data) ? data[0] : data;

  let emailSent = false, emailError: string | null = null;
  if (row?.status === "approved" && row.previous_status !== "approved" && row.email) {
    const first = (row.full_name || "").split(" ")[0];
    const html = layout("Votre compte est activé",
      `<p>Bonjour${first ? " " + esc(first) : ""},</p>
       <p>Bonne nouvelle : votre compte <b>ASAP WORKPLAN</b> vient d'être validé. Vous pouvez dès maintenant vous connecter et suivre vos projets, vos activités et vos indicateurs.</p>
       ${button(APP_URL, "Accéder à mon espace")}
       <p>Connectez-vous avec l'adresse <b>${esc(row.email)}</b> et le mot de passe choisi lors de votre inscription. Vous pouvez aussi installer l'application sur votre ordinateur et votre téléphone.</p>
       <p style="color:#5b6577;font-size:15px">Si vous n'êtes pas à l'origine de cette inscription, répondez simplement à cet e-mail.</p>`);
    const r = await sendMail(row.email, "Votre compte ASAP WORKPLAN est activé", html);
    emailSent = r.ok; emailError = r.error;
    if (r.ok) await sb.rpc("admin_mark_user_notified", { target: body.user_id });
  }
  return json(req, { ok: true, status: row?.status, emailSent, emailError });
});
