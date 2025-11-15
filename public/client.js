// client.js (оновлений) - заміни весь файл цим вмістом
(function(){
  const SERVER = window.location.origin;
  const socket = io(SERVER);

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const boardInput = document.getElementById('board');
  const joinBtn = document.getElementById('join');
  const clearBtn = document.getElementById('clear');
  const saveBtn = document.getElementById('save');
  const statusEl = document.getElementById('status');
  const colorInput = document.getElementById('color');
  const widthInput = document.getElementById('width');
  const serverUrlEl = document.getElementById('server-url');

  serverUrlEl.textContent = SERVER;

  let drawing = false;
  let last = null;
  let board = null; // не приєднано

  // Налаштування canvas: встановлюємо внутрішній розмір у device pixels
  function resizeCanvas(){
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.floor(rect.width);
    const cssH = Math.floor(rect.height);

    // встановлюємо видимі розміри (CSS)
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';

    // встановлюємо внутрішній розмір у фізичних пікселях
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));

    // Встановлюємо трансформ, щоб малювати у CSS-пікселях (з урахуванням DPR)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
  }

  // Просте очищення полотна з правильним використанням трансформації
  function clearCanvas(){
    // зберегти стан, скинути трансформ, очистити фізичні пікселі, відновити
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  window.addEventListener('resize', resizeCanvas);
  // викличемо на старті
  resizeCanvas();

  function setStatus(msg, color){
    statusEl.textContent = msg || '';
    statusEl.style.color = color || '';
  }

  function drawLine(x1,y1,x2,y2, strokeStyle, lineWidth){
    // тут координати в CSS-пікселях — ctx вже підлаштований через setTransform
    ctx.strokeStyle = strokeStyle || '#000';
    ctx.lineWidth = lineWidth || 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function ensureJoined(){
    if(!board){
      setStatus('Please join a board first', 'crimson');
      return false;
    }
    return true;
  }

  // pointer events: використовуємо offsetX/offsetY — це дає координати відносно canvas у CSS px
  canvas.addEventListener('pointerdown', (e)=>{
    if(!ensureJoined()) return;
    drawing = true;
    last = { x: e.offsetX, y: e.offsetY };
  });
  canvas.addEventListener('pointerup', ()=>{ drawing=false; last=null; });
  canvas.addEventListener('pointerout', ()=>{ drawing=false; last=null; });
  canvas.addEventListener('pointermove', (e)=>{
    if(!drawing) return;
    const cur = { x: e.offsetX, y: e.offsetY };
    const color = colorInput.value;
    const w = parseInt(widthInput.value, 10) || 2;
    // малюємо локально
    drawLine(last.x, last.y, cur.x, cur.y, color, w);
    // відправляємо подію на сервер (координати в CSS px)
    socket.emit('draw_op', { board, op: { type:'line', x1:last.x, y1:last.y, x2:cur.x, y2:cur.y, color, width: w } });
    last = cur;
  });

  // Join logic
  joinBtn.addEventListener('click', ()=>{
    const b = (boardInput.value || '').trim();
    if(!b){ setStatus('Enter board id', 'crimson'); return; }
    board = b;
    socket.emit('join_board', { board });
    setStatus(`Joined ${board}`, 'green');
    // fetch snapshot via REST then render
    fetch(`${SERVER}/snapshot/${encodeURIComponent(board)}`)
      .then(r=>r.json())
      .then(ops=>{
        clearCanvas();
        // ops координати в CSS px — малюємо прямо
        ops.forEach(op => {
          if(op.type === 'line') drawLine(op.x1, op.y1, op.x2, op.y2, op.color, op.width);
        });
      }).catch(err=>{ /* ignore */ });
  });

  clearBtn.addEventListener('click', ()=>{
    if(!ensureJoined()) return;
    if(!confirm('Clear the board for everyone?')) return;
    socket.emit('clear_board', { board });
    clearCanvas();
  });

  saveBtn.addEventListener('click', ()=>{
    if(!ensureJoined()) return;
    socket.emit('save_snapshot', { board });
    setStatus('Saving snapshot...', 'blue');
  });

  // socket listeners
  socket.on('draw_op', (op)=>{
    if(!board) return;
    if(op.type === 'line') drawLine(op.x1, op.y1, op.x2, op.y2, op.color, op.width);
  });

  socket.on('snapshot', (ops)=>{
    clearCanvas();
    ops.forEach(op=>{ if(op.type==='line') drawLine(op.x1,op.y1,op.x2,op.y2,op.color,op.width); });
  });

  socket.on('clear_board', ()=> clearCanvas());

  socket.on('save_snapshot_result', (res)=>{
    if(res && res.ok){ setStatus('Snapshot saved ✔', 'green'); }
    else { setStatus('Save failed', 'crimson'); }
    setTimeout(()=> setStatus(''), 1500);
  });

})();
