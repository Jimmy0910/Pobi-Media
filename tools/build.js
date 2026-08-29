const fs = require('fs');
const path = require('path');

const clientDir = path.join(__dirname, '../src/client');
const htmlTpl = fs.readFileSync(path.join(clientDir, 'template.html'), 'utf8');
const css = fs.readFileSync(path.join(clientDir, 'style.css'), 'utf8');
const js = fs.readFileSync(path.join(clientDir, 'main.js'), 'utf8');

const outputHtml = htmlTpl.replace('/* {{CSS}} */', css).replace('/* {{JS}} */', js);

const publicDir = path.join(__dirname, '../public');
if (!fs.existsSync(publicDir)) { fs.mkdirSync(publicDir, { recursive: true }); }

fs.writeFileSync(path.join(publicDir, 'index.html'), outputHtml, 'utf8');
fs.writeFileSync(path.join(__dirname, '../index.html'), outputHtml, 'utf8');

console.log('Build complete! Output size: ' + outputHtml.length + ' bytes');