// Outils communs : CORS, e-mails (Resend), échappement HTML
export const ALLOWED_ORIGINS = [
  "https://asapworkplan.com",
  "https://www.asapworkplan.com",
  "https://setou-zon.github.io",
];
export const APP_URL = "https://asapworkplan.com/app/";

export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
}
export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function layout(title: string, body: string): string {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f6f7f9;font-family:'EB Garamond',Garamond,Georgia,serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
<tr><td style="height:4px;background:linear-gradient(90deg,#e8460f,#0a8a62)"></td></tr>
<tr><td style="padding:28px 32px 8px"><div style="font-size:20px;font-weight:700;letter-spacing:-0.01em">ASAP <span style="color:#e8460f">WORKPLAN</span></div></td></tr>
<tr><td style="padding:8px 32px 28px;font-size:17px;line-height:1.6">
<h1 style="font-size:24px;line-height:1.25;margin:8px 0 16px;color:#0b1324">${title}</h1>${body}</td></tr>
<tr><td style="padding:16px 32px 24px;border-top:1px solid #eef1f5;font-size:13px;color:#5b6577;line-height:1.5">
Vos données sont privées : chaque organisation dispose d'un espace isolé, accessible uniquement par les membres qu'elle a invités.<br>ASAP WORKPLAN · asapworkplan.com</td></tr>
</table></td></tr></table></body></html>`;
}
export const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${href}" style="background:#e8460f;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:4px;font-weight:600;display:inline-block">${label}</a></p>`;

export async function sendMail(to: string | string[], subject: string, html: string, replyTo?: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, error: "RESEND_API_KEY non configurée" };
  const from = Deno.env.get("MAIL_FROM") ?? "ASAP WORKPLAN <notifications@asapworkplan.com>";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    return r.ok ? { ok: true, error: null } : { ok: false, error: (await r.text()).slice(0, 300) };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 300) };
  }
}
