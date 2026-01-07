document.getElementById('send').addEventListener('click', async () => {
  const f = document.getElementById('file').files[0];
  if (!f) return alert('Select a CSV file');
  const fd = new FormData();
  fd.append('file', f);
  const res = await fetch('/predict', { method: 'POST', body: fd });
  const data = await res.json();
  document.getElementById('out').textContent = JSON.stringify(data, null, 2);
});
