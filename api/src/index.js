const WebSocket = require("ws");
const config = require("../config");

const PORT = 3100;

let tasks = {};
for (let task of config.tasks) {
  tasks[task.id] = task;
}

// ensure idealDay has all the registered tasks
// and ensure durations add up to 24 hours
let totalDuration = 0;
for (let { taskId, duration } of config.idealDay) {
  totalDuration += duration;
  if (tasks[taskId] == null) {
    throw new Error("Missing task: " + taskId);
  }
}

let TWENTY_FOUR_HOURS = 1000 * 60 * 60 * 24;
let IDEAL_DAY_TOTAL_LENGTH = TWENTY_FOUR_HOURS - config.sleepTime;
if (totalDuration !== IDEAL_DAY_TOTAL_LENGTH) {
  let offByMinutes = (IDEAL_DAY_TOTAL_LENGTH - totalDuration) / (1000 * 60);
  throw new Error(`ideal day is not complete (off by ${offByMinutes} minutes)`);
}

let state = {
  tasks,
  idealDay: config.idealDay,
  completions: [],
  // TODO: what do we do about this? we need to fix rendering in the frontend if this doesnt exist
  startTime: Date.now(),
  running: false,
};

function serializeState() {
  return JSON.stringify(state);
}

function updateState(fn) {
  fn();
  broadcast(serializeState());
}

function startDay() {
  if (state.running) return;
  updateState(() => {
    state.running = true;
    state.completions = [];
    state.startTime = Date.now();
  });
}

function stopDay() {
  if (!state.running) return;
  updateState(() => {
    state.completions.push(Date.now());
    state.running = false;
  });
}

function completeTask() {
  if (!state.running) return;
  updateState(() => {
    state.completions.push(Date.now());
    if (state.completions.length === state.idealDay.length) {
      state.running = false;
    }
  });
}

function undoCompletion() {
  updateState(() => {
    state.completions.pop();
    if (!state.running && state.completions.length === state.idealDay.length) {
      state.running = true;
    }
  });
}

function broadcast(msg) {
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  });
}

let wss = new WebSocket.Server({ port: PORT });
wss.on("connection", function connection(ws) {
  ws.send(serializeState());
  ws.on("message", (msg) => {
    switch (msg) {
      case "start-day":
        startDay();
        break;
      case "stop-day":
        stopDay();
        break;
      case "complete-task":
        completeTask();
        break;
      case "undo-completion":
        undoCompletion();
        break;
    }
  });
});

console.log(`Server listening on ${PORT}`);