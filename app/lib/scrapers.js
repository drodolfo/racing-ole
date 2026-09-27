export const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
};

export async function fetchJina(url, extraHeaders = {}) {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    cache: 'no-store',
    headers: { ...extraHeaders },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Error HTTP: ${res.status}`);
  return await res.text();
}
