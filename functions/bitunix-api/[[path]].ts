export const onRequest = async (context: { request: Request }) => {
  const url = new URL(context.request.url);
  const upstreamPath = url.pathname.replace(/^\/bitunix-api/, '') || '/';
  const targetUrl = `https://fapi.bitunix.com${upstreamPath}${url.search}`;

  const headers = new Headers();
  headers.set('Accept', 'application/json');
  headers.set('User-Agent', 'Mozilla/5.0');

  const resp = await fetch(targetUrl, {
    method: context.request.method,
    headers,
  });

  const body = await resp.text();
  return new Response(body, {
    status: resp.status,
    headers: {
      'Content-Type': resp.headers.get('Content-Type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
};