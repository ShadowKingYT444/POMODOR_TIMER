const { invoke } = window.__TAURI__.core;

// State
let state = {
  userName: localStorage.getItem('break_manager_user') || null,
  spotifyClientId: localStorage.getItem('break_manager_spotify_client_id') || 'b7131dd5ad5b4d899438670facc5927f',
  spotifyToken: localStorage.getItem('break_manager_spotify_token') || null,
  mode: 'WORK', // WORK, BREAK_PROMPT, BREAK
  workDuration: { m: 25, s: 0 },
  breakDuration: { m: 10, s: 0 },
  timerRunning: false,
  timerInterval: null,
  remainingTime: 0, // in seconds
  tasks: JSON.parse(localStorage.getItem('break_manager_tasks')) || []
};

// DOM Elements - Onboarding
const modal = document.getElementById('onboarding-modal');
const nameInput = document.getElementById('user-name-input');
const spotifyClientIdInput = document.getElementById('spotify-client-id-input');
const saveNameBtn = document.getElementById('save-name-btn');

// DOM Elements - Break Overlay
const breakOverlay = document.getElementById('break-overlay');
const breakMessage = document.getElementById('break-message');
const startBreakBtn = document.getElementById('start-break-btn');

// DOM Elements - Timer
const statusText = document.getElementById('status-text');
const minInput = document.getElementById('minutes-input');
const secInput = document.getElementById('seconds-input');
const timerToggleBtn = document.getElementById('timer-toggle-btn');
const timerSection = document.querySelector('.timer-section');

// DOM Elements - Tasks
const taskForm = document.getElementById('task-form');
const taskInput = document.getElementById('new-task-input');
const taskList = document.getElementById('task-list');

// --- Onboarding Logic ---
function checkOnboarding() {
  if (!state.userName) {
    modal.classList.remove('hidden');
    timerSection.style.filter = 'blur(5px)';
  } else {
    initApp();
  }
}

saveNameBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  const customClientId = spotifyClientIdInput.value.trim();

  if (name) {
    state.userName = name;
    localStorage.setItem('break_manager_user', name);

    if (customClientId) {
      state.spotifyClientId = customClientId;
      localStorage.setItem('break_manager_spotify_client_id', customClientId);
    }

    modal.classList.add('hidden');
    timerSection.style.filter = 'none';
    initApp();
  }
});

nameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') saveNameBtn.click();
});

// --- Timer Logic ---
function updateDisplay(m, s) {
  minInput.value = m.toString().padStart(2, '0');
  secInput.value = s.toString().padStart(2, '0');
}

function parseInputs() {
  let m = parseInt(minInput.value) || 0;
  let s = parseInt(secInput.value) || 0;
  return m * 60 + s;
}

function stopTimer() {
  clearInterval(state.timerInterval);
  state.timerRunning = false;
  timerToggleBtn.textContent = state.mode === 'WORK' ? 'Start Focus' : 'Start Break';
  minInput.disabled = false;
  secInput.disabled = false;
}

function startTimer() {
  if (!state.timerRunning) {
    // If just starting, grab value from inputs
    state.remainingTime = parseInputs();

    // Save work duration if starting work
    if (state.mode === 'WORK') {
      state.workDuration.m = Math.floor(state.remainingTime / 60);
      state.workDuration.s = state.remainingTime % 60;
    }

    if (state.remainingTime <= 0) return;

    state.timerRunning = true;
    timerToggleBtn.textContent = 'Pause';
    minInput.disabled = true;
    secInput.disabled = true;

    state.timerInterval = setInterval(() => {
      state.remainingTime--;

      let m = Math.floor(state.remainingTime / 60);
      let s = state.remainingTime % 60;
      updateDisplay(m, s);

      if (state.remainingTime <= 0) {
        handleTimerEnd();
      }
    }, 1000);
  } else {
    stopTimer();
  }
}

function handleTimerEnd() {
  stopTimer();

  if (state.mode === 'WORK') {
    state.mode = 'BREAK_PROMPT';
    showBreakPrompt();
  } else if (state.mode === 'BREAK') {
    // End of break, reset to work
    state.mode = 'WORK';
    statusText.textContent = 'WORK';
    statusText.style.color = 'var(--text-muted)';
    updateDisplay(state.workDuration.m, state.workDuration.s);
    // Optionally auto-start work or wait for user
  }
}

function showBreakPrompt() {
  breakMessage.textContent = `TAKE A BREAK ${state.userName.toUpperCase()}`;
  breakOverlay.classList.remove('hidden');
}

startBreakBtn.addEventListener('click', () => {
  breakOverlay.classList.add('hidden');
  state.mode = 'BREAK';
  statusText.textContent = 'BREAK';
  statusText.style.color = 'var(--danger)';
  updateDisplay(state.breakDuration.m, state.breakDuration.s);
  startTimer(); // Auto start break
});

timerToggleBtn.addEventListener('click', startTimer);

// Validation for inputs to ensure numbers
[minInput, secInput].forEach(input => {
  input.addEventListener('change', () => {
    let val = parseInt(input.value) || 0;
    if (val < 0) val = 0;
    input.value = val.toString().padStart(2, '0');
  });
});

// --- Tasks Logic ---
function saveTasks() {
  localStorage.setItem('break_manager_tasks', JSON.stringify(state.tasks));
}

function renderTasks() {
  taskList.innerHTML = '';
  state.tasks.forEach((task, index) => {
    const li = document.createElement('li');
    if (task.completed) li.classList.add('completed');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = task.completed;
    cb.addEventListener('change', () => toggleTask(index));

    const span = document.createElement('span');
    span.textContent = task.text;
    span.style.flex = '1';

    const delBtn = document.createElement('button');
    delBtn.textContent = '×';
    delBtn.className = 'delete-task-btn';
    delBtn.addEventListener('click', () => deleteTask(index));

    li.appendChild(cb);
    li.appendChild(span);
    li.appendChild(delBtn);
    taskList.appendChild(li);
  });
}

function addTask(text) {
  state.tasks.push({ text, completed: false });
  saveTasks();
  renderTasks();
}

function toggleTask(idx) {
  state.tasks[idx].completed = !state.tasks[idx].completed;
  saveTasks();
  renderTasks();
}

function deleteTask(idx) {
  state.tasks.splice(idx, 1);
  saveTasks();
  renderTasks();
}

taskForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = taskInput.value.trim();
  if (text) {
    addTask(text);
    taskInput.value = '';
  }
});

// --- Spotify Logic ---
const SPOTIFY_SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
const REDIRECT_URI = 'http://127.0.0.1:1420/';

const spotLoginBtn = document.getElementById('spotify-login-btn');
const spotSong = document.getElementById('spotify-song');
const spotArtist = document.getElementById('spotify-artist');
const spotPlayBtn = document.getElementById('spot-play');
const spotPrevBtn = document.getElementById('spot-prev');
const spotNextBtn = document.getElementById('spot-next');

let spotifyPollInterval = null;

function checkSpotifyToken() {
  // Check URL hash for implicit grant token
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  const tokenUrl = params.get('access_token');

  if (tokenUrl) {
    state.spotifyToken = tokenUrl;
    localStorage.setItem('break_manager_spotify_token', tokenUrl);
    window.history.replaceState({}, document.title, "/"); // Clean up URL
  }

  if (state.spotifyToken) {
    spotLoginBtn.classList.add('hidden');
    startSpotifyPolling();
  }
}

function loginSpotify() {
  const authUrl = `https://accounts.spotify.com/authorize?client_id=${state.spotifyClientId}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SPOTIFY_SCOPES)}`;
  window.location.href = authUrl;
}

async function fetchSpotify(endpoint, method = 'GET', body = null) {
  if (!state.spotifyToken) return null;

  const options = {
    method,
    headers: { 'Authorization': `Bearer ${state.spotifyToken}` }
  };
  if (body) options.body = JSON.stringify(body);

  try {
    const res = await fetch(`https://api.spotify.com/v1${endpoint}`, options);
    if (res.status === 401) {
      // Token expired
      state.spotifyToken = null;
      localStorage.removeItem('break_manager_spotify_token');
      spotLoginBtn.classList.remove('hidden');
      spotSong.textContent = 'Session Expired';
      spotArtist.textContent = 'Please log in again';
      clearInterval(spotifyPollInterval);
      return null;
    }
    if (res.status === 204) return true; // No content (usually means success for play/pause/skip)
    return await res.json();
  } catch (error) {
    console.error('Spotify API Error:', error);
    return null;
  }
}

async function getCurrentlyPlaying() {
  const data = await fetchSpotify('/me/player/currently-playing');

  if (!data || !data.item) {
    spotSong.textContent = 'No song playing';
    spotArtist.textContent = 'Connect to Spotify to control playback';
    return;
  }

  spotSong.textContent = data.item.name;
  spotArtist.textContent = data.item.artists.map(a => a.name).join(', ');
  spotPlayBtn.textContent = data.is_playing ? '⏸' : '▶️';
}

function startSpotifyPolling() {
  getCurrentlyPlaying();
  if (spotifyPollInterval) clearInterval(spotifyPollInterval);
  spotifyPollInterval = setInterval(getCurrentlyPlaying, 5000);
}

// Spotify Controls
spotLoginBtn.addEventListener('click', loginSpotify);

spotPlayBtn.addEventListener('click', async () => {
  const data = await fetchSpotify('/me/player/currently-playing');
  if (data && data.is_playing) {
    await fetchSpotify('/me/player/pause', 'PUT');
  } else {
    await fetchSpotify('/me/player/play', 'PUT');
  }
  setTimeout(getCurrentlyPlaying, 500); // Wait a bit for Spotify to process before updating UI
});

spotPrevBtn.addEventListener('click', async () => {
  await fetchSpotify('/me/player/previous', 'POST');
  setTimeout(getCurrentlyPlaying, 500);
});

spotNextBtn.addEventListener('click', async () => {
  await fetchSpotify('/me/player/next', 'POST');
  setTimeout(getCurrentlyPlaying, 500);
});

// --- Initialization ---
function initApp() {
  renderTasks();
  updateDisplay(state.workDuration.m, state.workDuration.s);
  checkSpotifyToken();
}

// Start
window.addEventListener('DOMContentLoaded', () => {
  checkOnboarding();
});
