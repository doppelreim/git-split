const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = parseInt(process.env.PORT || '9999', 10);
const TARGET = 'https://github.com';

function addCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Git-Protocol');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type, WWW-Authenticate, Git-Protocol');
}

const server = http.createServer((clientReq, clientRes) => {
  // Handle preflight
  if (clientReq.method === 'OPTIONS') {
    addCorsHeaders(clientRes);
    clientRes.writeHead(204);
    clientRes.end();
    return;
  }

  const targetUrl = new URL(clientReq.url, TARGET);

  const headers = { ...clientReq.headers };
  headers.host = targetUrl.host;
  // Remove origin/referer to avoid GitHub rejecting the request
  delete headers.origin;
  delete headers.referer;

  const options = {
    hostname: targetUrl.hostname,
    port: 443,
    path: targetUrl.pathname + targetUrl.search,
    method: clientReq.method,
    headers,
  };

  const proxyReq = https.request(options, (proxyRes) => {
    addCorsHeaders(clientRes);
    clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(clientRes, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    addCorsHeaders(clientRes);
    clientRes.writeHead(502);
    clientRes.end('Proxy error: ' + err.message);
  });

  clientReq.pipe(proxyReq, { end: true });
});

server.listen(PORT, () => {
  console.log(`CORS proxy listening on http://localhost:${PORT}`);
  console.log(`Forwarding to ${TARGET}`);
});
