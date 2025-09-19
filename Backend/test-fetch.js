const http = require('http');
http.get('http://localhost:4000/api/health', (res) => {
  res.setEncoding('utf8');
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('HEALTH:', data));
}).on('error', err => console.error('ERR', err.message));

http.get('http://localhost:4000/api/analyses', (res) => {
  res.setEncoding('utf8');
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('ANALYSES:', data));
}).on('error', err => console.error('ERR', err.message));
