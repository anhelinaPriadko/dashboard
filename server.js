const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

app.post('/save/:board', (req, res) => {
  const board = req.params.board || 'default';
  const result = saveSnapshotToFile(board);
  res.json(result);
});

app.get('/snapshots/:board', (req, res) => {
  const board = req.params.board || 'default';
  const p = path.join(SNAPSHOT_DIR, `${board}.json`);
  if (fs.existsSync(p)) {
    return res.sendFile(p);
  }
  return res.status(404).json({ ok: false, error: 'Snapshot not found' });
});


const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);
app.use(express.static(publicDir));

app.get('/', (req, res) => {
  const indexPath = path.join(publicDir, 'client.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return res.status(200).send('<h3>Server is running. Place client.html into /public and reload.</h3>');
});

app.get('/health', (req, res) => res.json({ ok: true }));

const BOARDS = {};

io.on('connection', (socket) => {
  console.log('client connected', socket.id);

  socket.on('join_board', (data) => {
    const newBoard = (data && data.board) || 'default';

    if (socket.currentBoard && socket.currentBoard !== newBoard) {
      socket.leave(socket.currentBoard);
      console.log(`socket ${socket.id} left ${socket.currentBoard}`);
    }

    socket.join(newBoard);
    socket.currentBoard = newBoard;

    socket.emit('snapshot', BOARDS[newBoard] || []);
    console.log(`socket ${socket.id} joined ${newBoard}`);
  });

  socket.on('draw_op', (data) => {
    const board = data.board || 'default';
    const op = data.op;
    BOARDS[board] = BOARDS[board] || [];
    BOARDS[board].push(op);
    socket.to(board).emit('draw_op', op);
  });

  socket.on('clear_board', (data) => {
    const board = data.board || 'default';
    BOARDS[board] = [];
    io.to(board).emit('clear_board');
  });

  socket.on('save_snapshot', (data) => {
    const board = (data && data.board) || 'default';
    const result = saveSnapshotToFile(board);
    socket.emit('save_snapshot_result', result);
  });
  
  socket.on('save_snapshot_result', (result) => {
  if (result.ok) {
    setStatus('Snapshot saved.');
  } else {
    setStatus('Save failed: ' + (result.error || 'unknown'));
  }
  setTimeout(()=> setStatus(''), 2000);
});

  socket.on('disconnect', () => {
    console.log('client disconnected', socket.id);
  });
});

const SNAPSHOT_DIR = path.join(__dirname, 'snapshots');
if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR);

function saveSnapshotToFile(board) {
  try {
    const ops = BOARDS[board] || [];
    const filePath = path.join(SNAPSHOT_DIR, `${board}.json`);
    fs.writeFileSync(filePath, JSON.stringify(ops, null, 2), 'utf8');
    console.log(`Saved snapshot for board="${board}" to ${filePath}`);
    return { ok: true, path: filePath };
  } catch (err) {
    console.error('Error saving snapshot', err);
    return { ok: false, error: err.message };
  }
}


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
