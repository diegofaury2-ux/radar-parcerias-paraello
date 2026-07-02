// api/state.js — Radar de Parcerias Paraéllo
// Upstash Redis REST API handler — NO password required (open access)

const REDIS_KEY = 'radar-parcerias-paraello-v2:state:v1';

export default async function handler(req, res) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return res.status(500).json({ error: 'Redis not configured' });
  }

  if (req.method === 'GET') {
    const r = await fetch(`${url}/get/${encodeURIComponent(REDIS_KEY)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await r.json();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ value: data.result ?? null });
  }

  if (req.method === 'POST') {
    const body = req.body;
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    await fetch(`${url}/set/${encodeURIComponent(REDIS_KEY)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
      body: payload
    });
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}