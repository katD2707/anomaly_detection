let ws = null;
const out = document.getElementById('out');

// Chart setup
const ctxV = document.getElementById('chart-values').getContext('2d');
const ctxS = document.getElementById('chart-scores').getContext('2d');
const maxPoints = 200;
const dataVals = { labels: [], datasets: [{ label: 'value', data: [], borderColor: 'blue', fill: false, pointBackgroundColor: [] }] };
const dataScores = { labels: [], datasets: [{ label: 'anomaly score', data: [], borderColor: 'red', fill: false, pointBackgroundColor: [] }] };
const chartVals = new Chart(ctxV, { type: 'line', data: dataVals, options: { animation: false, responsive: true } });
const chartScores = new Chart(ctxS, { type: 'line', data: dataScores, options: { animation: false, responsive: true } });

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
  if (!ws || ws.readyState !== WebSocket.OPEN) return alert('WS not connected');
  const v = document.getElementById('ws-input').value;
  if (!v) return alert('Enter CSV text or numeric value');
  ws.send(v);
});

// File upload via HTTP predict (keeps main.js simple)
document.getElementById('send').addEventListener('click', async () => {
  const f = document.getElementById('file').files[0];
  if (!f) return alert('Select a CSV file');
  const fd = new FormData();
  fd.append('file', f);
  const res = await fetch('/predict', { method: 'POST', body: fd });
  const data = await res.json();
  if (data.scores) {
    const text = await f.text();
    // try to parse CSV values
    const rows = text.trim().split('\n').slice(1).map(r=>r.split(',').map(Number));
    setBulk(rows.map(r=>r), data.scores);
  }
});

// Chatbot analyze button
document.getElementById('chat-analyze').addEventListener('click', async () => {
  // gather current chart data
  const values = dataVals.datasets[0].data.map(v=>typeof v === 'number' ? v : (Array.isArray(v)?v[0]:v));
  const scores = dataScores.datasets[0].data.slice();
  const res = await fetch('/analyze', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({values: values, scores: scores}) });
  const j = await res.json();
  document.getElementById('chat-response').textContent = j.analysis;
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
  alert('Session saved');
});
document.getElementById('load-session').addEventListener('click', ()=>{
  const s = localStorage.getItem('md_session');
  if (!s) return alert('No session saved');
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

