const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const clientDir = path.join(rootDir, 'src/client');
const htmlTpl = fs.readFileSync(path.join(clientDir, 'template.html'), 'utf8');
const css = fs.readFileSync(path.join(clientDir, 'style.css'), 'utf8');
const js = fs.readFileSync(path.join(clientDir, 'main.js'), 'utf8');

const outputHtml = htmlTpl.replace('/* {{CSS}} */', () => css).replace('/* {{JS}} */', () => js);

const publicDir = path.join(rootDir, 'public');
if (!fs.existsSync(publicDir)) { fs.mkdirSync(publicDir, { recursive: true }); }

fs.writeFileSync(path.join(publicDir, 'index.html'), outputHtml, 'utf8');
fs.writeFileSync(path.join(rootDir, 'index.html'), outputHtml, 'utf8');

// Cloudflare Pages _routes.json
const routesJson = {
  version: 1,
  include: ['/api/*'],
  exclude: []
};
fs.writeFileSync(path.join(publicDir, '_routes.json'), JSON.stringify(routesJson, null, 2), 'utf8');

console.log('Build complete! Output size: ' + outputHtml.length + ' bytes.');
