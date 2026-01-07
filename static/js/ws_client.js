let ws = null;
const out = document.getElementById('out');
let lastCSVRows = null;
let lastCSVHeaders = null;
let lastPredictScores = null;

// Chart setup
const ctxV = document.getElementById('chart-values').getContext('2d');
const ctxS = document.getElementById('chart-scores').getContext('2d');
const maxPoints = 200;
const dataVals = { labels: [], datasets: [{ label: 'value', data: [], borderColor: 'blue', fill: false, pointBackgroundColor: [] }] };
const dataScores = { labels: [], datasets: [{ label: 'anomaly score', data: [], borderColor: 'red', fill: false, pointBackgroundColor: [] }] };
const commonOptions = {
  animation: false,
  responsive: true,
  maintainAspectRatio: false,
  elements: { point: { radius: 2 } },
  scales: {
    x: { display: true, ticks: { maxRotation: 0, autoSkip: true } },
    y: { display: true, beginAtZero: false }
  }
};
const chartVals = new Chart(ctxV, { type: 'line', data: dataVals, options: commonOptions });
const chartScores = new Chart(ctxS, { type: 'line', data: dataScores, options: commonOptions });

function pushPoint(value, score) {
  const nextLabel = (dataVals.labels.length ? parseInt(dataVals.labels[dataVals.labels.length-1]) + 1 : 0).toString();
  dataVals.labels.push(nextLabel);
  dataVals.datasets[0].data.push(value);
  dataScores.labels.push(nextLabel);
  dataScores.datasets[0].data.push(score);
  // set point colors according to threshold
  const t = parseFloat(document.getElementById('threshold').value || '1.0');
  const color = (score > t) ? 'red' : 'rgba(0,0,0,0.1)';
  dataScores.datasets[0].pointBackgroundColor.push(color);
  dataVals.datasets[0].pointBackgroundColor.push('rgba(0,0,0,0.1)');
  if (dataVals.labels.length > maxPoints) {
    dataVals.labels.shift(); dataVals.datasets[0].data.shift();
    dataVals.datasets[0].pointBackgroundColor.shift();
    dataScores.labels.shift(); dataScores.datasets[0].data.shift();
    dataScores.datasets[0].pointBackgroundColor.shift();
  }
  chartVals.update(); chartScores.update();
}

function setBulk(values, scores) {
  dataVals.labels.length = 0; dataVals.datasets[0].data.length = 0;
  dataScores.labels.length = 0; dataScores.datasets[0].data.length = 0;
  dataVals.datasets[0].pointBackgroundColor.length = 0;
  dataScores.datasets[0].pointBackgroundColor.length = 0;
  // populate channel selector if values are arrays
  const chSel = document.getElementById('channel-select');
  chSel.innerHTML = '';
  if (values.length && Array.isArray(values[0])) {
    for (let i=0;i<values[0].length;i++){
      const opt = document.createElement('option'); opt.value = i; opt.innerText = 'channel_'+i; chSel.appendChild(opt);
    }
  } else {
    const opt = document.createElement('option'); opt.value = 0; opt.innerText = 'value'; chSel.appendChild(opt);
  }
  for (let i=0;i<values.length;i++){
    dataVals.labels.push(i.toString());
    const raw = Array.isArray(values[i])?values[i]:[values[i]];
    const chIdx = parseInt(document.getElementById('channel-select').value || 0);
    dataVals.datasets[0].data.push(raw[chIdx] ?? raw[0]);
    dataVals.datasets[0].pointBackgroundColor.push('rgba(0,0,0,0.1)');
    dataScores.labels.push(i.toString());
    dataScores.datasets[0].data.push(scores[i]);
    const t = parseFloat(document.getElementById('threshold').value || '1.0');
    dataScores.datasets[0].pointBackgroundColor.push((scores[i] > t)?'red':'rgba(0,0,0,0.1)');
  }
  // apply smoothing if requested
  if (document.getElementById('smoothing').checked) {
    const w = parseInt(document.getElementById('smoothing-window').value || '3');
    const sm = applySmoothing(dataVals.datasets[0].data, w);
    dataVals.datasets[0].data = sm;
  }
  chartVals.update(); chartScores.update();
}

function log(msg) {
  // keep hidden pre for debug
}

// Toast helper
function showToast(text, kind='info', timeout=4000){
  const root = document.getElementById('toast-root');
  if (!root) { alert(text); return; }
  const t = document.createElement('div'); t.className = 'toast '+kind; t.textContent = text; root.appendChild(t);
  setTimeout(()=>{ t.style.transition='opacity 280ms'; t.style.opacity='0'; setTimeout(()=>root.removeChild(t),300); }, timeout);
}

document.getElementById('ws-connect').addEventListener('click', () => {
  if (ws) return;
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  ws.onopen = () => {
    log({event: 'ws_open'});
    document.getElementById('ws-connect').disabled = true;
    document.getElementById('ws-disconnect').disabled = false;
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.values && msg.scores) {
        setBulk(msg.values, msg.scores);
      } else if (msg.values && msg.scores === undefined) {
        // sometimes only values
        setBulk(msg.values, Array(msg.values.length).fill(0));
      } else if (msg.scores) {
        // values may be array of numbers
        const vals = msg.values || [];
        // push last point only
        const lastVal = (vals.length? (Array.isArray(vals[vals.length-1])?vals[vals.length-1][0]:vals[vals.length-1]) : 0);
        const lastScore = msg.scores[msg.scores.length-1];
        pushPoint(lastVal, lastScore);
      }
    } catch(e) { log(ev.data); }
  };
  ws.onclose = () => { log({event: 'ws_closed'}); ws = null; document.getElementById('ws-connect').disabled = false; document.getElementById('ws-disconnect').disabled = true; };
});

document.getElementById('ws-disconnect').addEventListener('click', () => {
  if (!ws) return;
  ws.close();
});

document.getElementById('ws-send').addEventListener('click', () => {
  const v = document.getElementById('ws-input').value;
  if (!v) return alert('Enter CSV text or numeric value');
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(v);
    return;
  }
  // fallback: send as a temporary CSV file to /predict
  try {
    const blob = new Blob([v], { type: 'text/csv' });
    const fd = new FormData();
    fd.append('file', blob, 'paste.csv');
    fetch('/predict', { method: 'POST', body: fd }).then(async res => {
      if (!res.ok) return showToast('Server error: ' + res.status, 'error');
      const data = await res.json();
      // parse pasted values into rows
      const rows = parseCSV(v);
      lastCSVRows = rows;
      lastPredictScores = data.scores;
      setBulk(rows.map(r=>r), data.scores);
      showPreview(v);
      showToast('Data sent (fallback)', 'info');
    }).catch(e=>showToast('Send failed: '+e.message, 'error'));
  } catch(e){ showToast('Could not send data: '+e.message, 'error'); }
});

// File upload via HTTP predict (keeps main.js simple)
document.getElementById('send').addEventListener('click', async () => {
  // hero send uses file input if present
  const f = document.getElementById('file').files[0];
  if (!f) return showToast('Select a CSV file', 'warn');
  await uploadFileAndSet(f);
});

// file-send button
document.getElementById('file-send').addEventListener('click', async () => {
  const f = document.getElementById('file').files[0];
  if (!f) return showToast('Select a CSV file', 'warn');
  await uploadFileAndSet(f);
});

// preview on file select
document.getElementById('file').addEventListener('change', async (ev) => {
  const f = ev.target.files && ev.target.files[0];
  if (!f) { document.getElementById('csv-preview').innerHTML = '<div class="empty">No file selected</div>'; return; }
  const txt = await f.text();
  showPreview(txt);
});

async function uploadFileAndSet(f){
  try{
    const fd = new FormData(); fd.append('file', f);
    const res = await fetch('/predict', { method: 'POST', body: fd });
    if (!res.ok) return showToast('Server error: '+res.status, 'error');
    const data = await res.json();
    const text = await f.text();
    const rows = parseCSV(text);
    lastCSVRows = rows;
    lastPredictScores = data.scores;
    setBulk(rows.map(r=>r), data.scores);
    showPreview(text);
    showToast('File uploaded and plotted', 'info');
  } catch(e){ alert('Upload failed: '+e.message); }
}

function parseCSV(text){
  // basic CSV parser: split rows and commas, convert to numbers when possible
  const lines = text.replace(/\r/g,'').trim().split('\n').filter(l=>l.trim().length>0);
  if (lines.length<=1) {
    lastCSVHeaders = null;
    lastCSVRows = lines.map(l=>l.split(/,|\s+/).map(n=>Number(n)));
    return lastCSVRows;
  }
  // detect if first line is header (non-numeric)
  const first = lines[0].split(/,|\s+/);
  const hasHeader = first.some(cell=>isNaN(Number(cell)));
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const rows = dataLines.map(l=>l.split(/,|\s+/).map(c=>{ const v=Number(c); return isNaN(v)?c:v;}));
  lastCSVHeaders = hasHeader ? first : null;
  lastCSVRows = rows;
  return rows;
}

function showPreview(text){
  const container = document.getElementById('csv-preview');
  const rows = parseCSV(text);
  if (!rows || rows.length===0){ container.innerHTML = '<div class="empty">No preview available</div>'; return; }
  // show first 5 rows and up to 6 columns
  const max = Math.min(rows.length, 5);
  const cols = Math.max(...rows.slice(0,max).map(r=>r.length));
  let html = '<table><thead><tr>';
  for(let c=0;c<cols;c++){
    const title = (lastCSVHeaders && lastCSVHeaders[c]) ? lastCSVHeaders[c] : `Col ${c+1}`;
    html += `<th data-col="${c}" class="col-header">${title}</th>`;
  }
  html += '</tr></thead><tbody>';
  for(let i=0;i<max;i++){
    html += '<tr>';
    for(let c=0;c<cols;c++) html += `<td>${rows[i][c]!==undefined?rows[i][c]:''}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table>';
  container.innerHTML = html;
  // attach header click handlers to choose column for plotting
  container.querySelectorAll('.col-header').forEach(th => th.addEventListener('click', (e)=>{
    const col = parseInt(th.getAttribute('data-col'));
    // set channel-select to this column
    const chSel = document.getElementById('channel-select');
    chSel.innerHTML = '';
    const opt = document.createElement('option'); opt.value = col; opt.innerText = (lastCSVHeaders && lastCSVHeaders[col])? lastCSVHeaders[col] : ('Col '+(col+1));
    chSel.appendChild(opt);
    // re-set bulk using selected column
    if (lastCSVRows && lastPredictScores) {
      setBulk(lastCSVRows.map(r=>r), lastPredictScores);
      showToast('Selected column '+(col+1)+' for plotting', 'info');
    }
  }));
}

// Chatbot analyze button
document.getElementById('chat-analyze').addEventListener('click', async () => {
  // gather current chart data
  const values = dataVals.datasets[0].data.map(v=>typeof v === 'number' ? v : (Array.isArray(v)?v[0]:v));
  const scores = dataScores.datasets[0].data.slice();
  const res = await fetch('/analyze', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({values: values, scores: scores}) });
  const j = await res.json();
  document.getElementById('chat-response').textContent = j.analysis;
});

// Export PNG and CSV
document.getElementById('export-png').addEventListener('click', ()=>{
  const link = document.createElement('a');
  link.href = chartVals.toBase64Image();
  link.download = 'values.png';
  link.click();
});

document.getElementById('export-csv').addEventListener('click', ()=>{
  const rows = [['index','value','score']];
  for (let i=0;i<dataVals.labels.length;i++){
    rows.push([dataVals.labels[i], dataVals.datasets[0].data[i], dataScores.datasets[0].data[i]]);
  }
  const csv = rows.map(r=>r.join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'chart_data.csv'; a.click();
  URL.revokeObjectURL(url);
});

// smoothing control
document.getElementById('smoothing-window').addEventListener('input', ()=>{
  document.getElementById('smoothing-window').title = document.getElementById('smoothing-window').value;
});

function applySmoothing(arr, window){
  if (!window || window<=1) return arr.slice();
  const out = [];
  for (let i=0;i<arr.length;i++){
    const start = Math.max(0, i-window+1);
    const slice = arr.slice(start, i+1);
    const avg = slice.reduce((a,b)=>a+(typeof b==='number'?b: (Array.isArray(b)?b[0]:0)),0)/slice.length;
    out.push(avg);
  }
  return out;
}

// Save / Load session
document.getElementById('save-session').addEventListener('click', ()=>{
  const sess = {values: dataVals.datasets[0].data, scores: dataScores.datasets[0].data};
  localStorage.setItem('md_session', JSON.stringify(sess));
  showToast('Session saved', 'info');
});
document.getElementById('load-session').addEventListener('click', ()=>{
  const s = localStorage.getItem('md_session');
  if (!s) return showToast('No session saved', 'warn');
  const sess = JSON.parse(s);
  setBulk(sess.values.map(v=>Array.isArray(v)?v:[v]), sess.scores);
});

// channel change
document.getElementById('channel-select').addEventListener('change', ()=>{
  // re-set bulk to pick new channel if available
  const vals = dataVals.datasets[0].data.map(v=>v);
  setBulk(vals.map(v=>Array.isArray(v)?v:[v]), dataScores.datasets[0].data);
});

// threshold UI update
document.getElementById('threshold').addEventListener('input', ()=>{
  document.getElementById('threshold-val').textContent = document.getElementById('threshold').value;
  // recolor score points
  const t = parseFloat(document.getElementById('threshold').value);
  dataScores.datasets[0].pointBackgroundColor = dataScores.datasets[0].data.map(s => s>t ? 'red' : 'rgba(0,0,0,0.1)');
  chartScores.update();
});

