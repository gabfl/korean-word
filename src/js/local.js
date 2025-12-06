const MAX_ATTEMPTS = 3;
const SITE_URL = 'https://koreanword.com';
const SITE_NAME = 'Korean Word';
let korean;
let definition;
let romanizations;
let currentAttempt;
let lastSubmittedValue = '';
let csvEntries = [];
let submitted = false;
const settings = {
  difficulty: 'normal',
  theme: localStorage.getItem('theme') || 'auto'
};

/**
 * Load CSV data from a file.
 * This function uses XMLHttpRequest to fetch the CSV file.
 * @returns {Promise} - A promise that resolves with the CSV data as a string.
 * If the request fails, it rejects with an error.
 */
function loadCSV() {
  // Load CSV and store it in a variable
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', './assets/dict.csv', true);
    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve(xhr.responseText);
      } else {
        reject(new Error(`Failed to load CSV: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send();
  });
}

/**
 * Play a new round of the game.
 * This function selects a random entry from the CSV data,
 * displays the Korean word and its definition, and resets the game state.
 * It also handles the input field and attempts.
 */
function play() {
  // Example usage
  const result = getCurrentOrNewEntry();
  // console.log('Word →', result.korean);
  // console.log('Definition →', result.definition);
  document.getElementById('output').textContent = result.korean;
  document.getElementById('definition').textContent = result.definition;

  romanizations = [
    Aromanize.romanize(result.korean, 'rr-translit').trim(),
    Aromanize.romanize(result.korean).trim(), // rr
    Aromanize.romanize(result.korean, 'skats').trim(),
    Aromanize.romanize(result.korean, 'ebi').trim(),
    Aromanize.romanize(result.korean, 'konsevich').trim(),
  ]
  // console.log('Romanizations →', romanizations);

  // Delete input value
  document.getElementById('word-input').value = '';

  // Unlock input
  lockInput(false);

  // Render streaks
  renderStreaks();

  // Hide elements
  correctAnswerShowOrHide(false);
  showOrHide('play-again', false);
  showOrHide('correct-answer', false);
  showOrHide('result-ok', false);
  showOrHide('result-error', false);
  showOrHide('definition', false);
  showOrHide('submit-button', true);
  showOrHide('attempt-display', true);

  korean = result.korean;
  definition = result.definition;
  submitted = false;

  document.getElementById('word-input').focus();
}

/**
 * Parse CSV data into an array of entries.
 * Each entry is an array with the first element being the Korean word
 * and the second element being the English definition.
 * @param {string} csv - The CSV data as a string.
 * @returns {Array} - An array of entries, each entry is an array of [korean, definition].
  * The first element is the Korean word and the second element is the English definition.
  */
function parseCSV(data) {
  return data.trim().split('\n').map(line => {
    const firstCommaIndex = line.indexOf(',');
    if (firstCommaIndex === -1) return [line, ''];

    const korean = line.slice(0, firstCommaIndex);
    let definition = line.slice(firstCommaIndex + 1);

    // Remove leading/trailing whitespace
    definition = definition.trim();

    // Remove leading/trailing quotes
    if (definition.startsWith('"') && definition.endsWith('"')) {
      definition = definition.slice(1, -1);
    }

    // Capitalize the first letter
    definition = definition.charAt(0).toUpperCase() + definition.slice(1);

    return [korean, definition];
  });
}

/**
 * Get the current or new entry from local storage.
 * If an entry is already stored, it returns that entry.
 * Otherwise, it generates a new random entry,
 * stores it in local storage, and returns it.
 * @returns {Object} - The current or new entry.
 */
function getCurrentOrNewEntry() {
  // Check if an entry is already stored
  const stored = localStorage.getItem('currentEntry');

  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      // If corrupted, fallback to a new one
      console.warn('Stored entry is invalid JSON, generating new one.');
    }
  }

  // Otherwise, get a new random one
  const newEntry = getRandomEntry(); // should return an object like { korean: ..., definition: ... }
  localStorage.setItem('currentEntry', JSON.stringify(newEntry));
  return newEntry;
}

/**
 * Clear the current entry from local storage.
 * This function is called when the user plays again or when the game is reset.
 * It removes the stored entry from local storage.
 */
function clearCurrentEntry() {
  // Clear the stored entry
  localStorage.removeItem('currentEntry');
}

/**
 * Get a random entry from the CSV data.
 */
function getRandomEntry() {
  let pool = csvEntries;

  if (settings.difficulty === 'easy') {
    pool = csvEntries.filter(([korean]) => countSyllables(korean) === 2);
  } else if (settings.difficulty === 'hard') {
    pool = csvEntries.filter(([korean]) => countSyllables(korean) >= 3);
  }

  if (pool.length === 0) {
    console.warn(`No entries match the selected difficulty: ${settings.difficulty}`);
    return null;
  }

  // console.log(`Dictionary size for difficulty "${settings.difficulty}": ${pool.length}`);

  const index = crypto.getRandomValues(new Uint32Array(1))[0] % pool.length;
  const [korean, definition] = pool[index];
  return { korean, definition };
}

/**
 * Count the number of syllables in a Korean word.
 * @param {string} word - The Korean word.
 * @returns {number} - The number of syllables in the word.
 */
function countSyllables(word) {
  return [...word].filter(char => isHangul(char)).length;
}

/**
 * Check if a character is a Hangul syllable.
 * @param {string} char - The character to check.
 * @returns {boolean} - True if the character is a Hangul syllable, false otherwise.
 */
function isHangul(char) {
  const code = char.charCodeAt(0);
  // Hangul syllables range: U+AC00 to U+D7AF
  return code >= 0xAC00 && code <= 0xD7AF;
}

/**
 * Sanitize the text by removing leading/trailing whitespace,
 * converting to lowercase, and removing special characters.
 * @param {string} input - Text.
 * @returns {string} - The sanitized text.
 */
function sanitizeText(input) {
  return input
    .trim()
    .toLowerCase()
    // Normalize accents (like ö → o)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    // Remove most symbols/punctuation but keep letters (including Korean, Cyrillic, etc.)
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Check if the answer is correct.
 * @param {string} input - The user's answer.
 * @returns {boolean} - True if the answer is correct, false otherwise.
 */
function checkAnswer(input) {
  // Sanitize the input
  input = sanitizeText(input);

  // If it's empty, return false
  if (input === '') {
    console.log('Empty input');
    return false;
  }

  console.log('Sanitized input →', input);
  // console.log('Possible answers → ', romanizations);

  // Check if the input matches any of the romanizations
  let isCorrect = romanizations.some(value => sanitizeText(value) === input);

  if (isCorrect) {
    console.log('Correct!');
    showOrHide('play-again', true);
    showOrHide('result-ok', true);
    showOrHide('result-error', false);
    showOrHide('correct-answer', false);
    showOrHide('submit-button', false);
    showOrHide('attempt-display', false);
    showOrHide('definition', true);
    lockInput(true);

    // Clear the current entry from local storage
    clearCurrentEntry();

    // Update the statistics
    updateStats(true);

    // Reset attempts
    resetAttempts();

    // Re-render the streak
    renderStreaks();
    submitted = true;

    return true;
  } else {
    console.log('Incorrect!');
    showOrHide('play-again', false);
    showOrHide('result-ok', false);
    showOrHide('result-error', true);

    if (currentAttempt >= MAX_ATTEMPTS) {
      // Disable the input and show the correct answer
      correctAnswerShowOrHide();
      showOrHide('play-again', true);
      showOrHide('submit-button', false);
      showOrHide('result-error', false);
      showOrHide('attempt-display', false);
      showOrHide('definition', true);
      lockInput(true);

      // Reset current streak
      resetStreak();

      // Reset attempts
      resetAttempts();

      // Clear the current entry from local storage
      clearCurrentEntry();

      // Update the statistics
      updateStats(false);
    } else {
      // Increase the attempt count
      recordAttempt();
    }

    return false;
  }
}

/**
 * Help the user by showing or hiding specific sections of the page.
 * @param {string} section - The section to show or hide.
 * @param {boolean} show - Whether to show or hide the section.
 */
function showOrHide(section, show = true) {
  if (section === 'play-again') {
    document.getElementById('play-again-offer').style.display = show ? 'block' : 'none';
  } else if (section === 'correct-answer') {
    document.getElementById('correct-answer').style.display = show ? 'block' : 'none';
  } else if (section === 'result-ok') {
    document.getElementById('result-ok').style.display = show ? 'block' : 'none';
  } else if (section === 'result-error') {
    document.getElementById('result-error').style.display = show ? 'block' : 'none';
  } else if (section === 'submit-button') {
    document.getElementById('submit-button').style.display = show ? 'block' : 'none';
  } else if (section === 'attempt-display') {
    document.getElementById('attempt-display').style.display = show ? 'block' : 'none';
  } else if (section === 'definition') {
    document.getElementById('definition').style.display = show ? 'block' : 'none';
  }
}

/**
 * Show or hide the correct answer on the page.
 * @param {boolean} show - Whether to show or hide the correct answer.
 */
function correctAnswerShowOrHide(show = true) {
  if (show) {
    document.getElementById('correct-answer-text').textContent = `Correct answer: ${romanizations[0]}`;
    document.getElementById('correct-answer').style.display = 'block';
    document.getElementById('play-again-offer').style.display = 'block';
  } else {
    document.getElementById('correct-answer').style.display = 'none';
  }
}

/**
 * Disable/Enable the input field.
 * @param {boolean} disable - Whether to disable or enable the input field.
 */
function lockInput(disable = true) {
  const inputField = document.getElementById('word-input');
  if (disable) {
    inputField.setAttribute('disabled', 'true');
  } else {
    inputField.removeAttribute('disabled');
  }
}

/**
 * Get the current and maximum streaks from local storage.
 * @returns {Object} - An object containing the current and maximum streaks.
 */
function getStreaks() {
  return {
    current: parseInt(localStorage.getItem('currentStreak') || '0'),
    max: parseInt(localStorage.getItem('maxStreak') || '0'),
  };
}

/**
 * Reset the current streak to 0.
 * This function updates the local storage and renders the streaks on the page.
 */
function resetStreak() {
  localStorage.setItem('currentStreak', '0');
  renderStreaks();
}

/**
 * Render the current and maximum streaks on the page.
 * This function retrieves the streaks from local storage and updates the DOM elements.
 */
function renderStreaks() {
  const { current, max } = getStreaks();
  console.log(`Current Streak → ${current}, Max Streak → ${max}`);
  document.getElementById('currentStreak').textContent = current;
  document.getElementById('maxStreak').textContent = max;
}

/**
 * Update the attempt display on the page.
 * This function updates the DOM element that shows the number of attempts left.
 * @param {number} attempt - The current attempt number.
 */
function recordAttempt() {
  console.log('Record attempt');
  let attempt = parseInt(localStorage.getItem('currentAttempt') || '0');

  if (attempt < 3) {
    attempt++;
    localStorage.setItem('currentAttempt', attempt);
    updateAttemptDisplay(attempt);
  }

  return attempt;
}

/**
 * Update the attempt display on the page.
 * This function updates the DOM element that shows the number of attempts left.
 */
function resetAttempts() {
  console.log('Resetting attempts');
  localStorage.setItem('currentAttempt', 1);
  updateAttemptDisplay(1);
}

/**
 * Update the attempt display on the page.
 * This function updates the DOM element that shows the number of attempts left.
 * @param {number} attempt - The current attempt number.
 */
function updateAttemptDisplay(attempt) {
  currentAttempt = attempt;
  console.log(`Attempt → ${currentAttempt}/${MAX_ATTEMPTS}`);

  const display = document.getElementById('attempt-display');

  // Set base text
  let text = `Attempt ${currentAttempt}/${MAX_ATTEMPTS}`;

  // Show hint icon if attempt > 1
  if (currentAttempt > 1) {
    text += ` <a href="#" data-bs-toggle="modal" data-bs-target="#hintModal" title="View Hangul reference" class="text-decoration-none">🧩</a>`;
  }

  display.innerHTML = text;
}

/**
 * Sanitize the input text and check if it has changed from the last submitted value.
 * @param {string} current - The current input text.
 * @returns {boolean} - True if the input has changed, false otherwise.
 */
function hasInputChanged(current) {
  return sanitizeText(current) !== lastSubmittedValue;
}

/**
 * Disable or enable the submit button based on the input value.
 */
function disableSubmit() {
  document.getElementById('submit-button').disabled = true;
}

/**
 * Enable the submit button.
 */
function enableSubmit() {
  document.getElementById('submit-button').disabled = false;
}

/**
 * Reset the submission state.
 */
function resetSubmissionState() {
  lastSubmittedValue = '';
  enableSubmit();
  document.getElementById('word-input').value = '';
}

/**
 * Apply the selected theme to the page.
 * This function updates the body class and theme attributes based on the selected theme.
 */
function applyTheme() {
  let theme = localStorage.getItem('theme') || 'auto';
  console.log('Theme →', theme);

  const body = document.body;
  body.classList.remove('light-mode', 'dark-mode'); // Optional: legacy support

  const streakTableHead = document.querySelector('#streakTable thead');
  const hintVowelsTableHead = document.querySelector('#hintVowelsTable thead');
  const hintConsonantsTableHead = document.querySelector('#hintConsonantsTable thead');
  const metaTheme = document.getElementById('meta-theme-color');

  // Handle 'auto' mode by detecting system preference
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    theme = prefersDark ? 'dark' : 'light';
  }

  // Apply theme to body and meta
  if (theme === 'dark') {
    body.setAttribute('data-bs-theme', 'dark');
    body.classList.remove('bg-light');
    body.classList.add('bg-dark', 'text-light');
    metaTheme.setAttribute('content', '#1a1a1a');
  } else {
    body.setAttribute('data-bs-theme', 'light');
    body.classList.remove('bg-dark', 'text-light');
    body.classList.add('bg-light');
    metaTheme.setAttribute('content', '#ffffff');
  }

  // Update all table headers
  updateTableHeaderTheme(streakTableHead, theme);
  updateTableHeaderTheme(hintVowelsTableHead, theme);
  updateTableHeaderTheme(hintConsonantsTableHead, theme);
}

/**
 * Update the theme of the table header.
 * This function updates the class of the table header element
 * based on the selected theme.
 * @param {HTMLElement} theadElement - The table header element to update.
 * @param {string} theme - The selected theme ('dark' or 'light').
 */
function updateTableHeaderTheme(theadElement, theme) {
  if (!theadElement) return;

  theadElement.classList.remove('table-light', 'table-dark');

  if (theme === 'dark') {
    theadElement.classList.add('table-dark');
  } else {
    theadElement.classList.add('table-light');
  }
}

/**
 * Save the selected theme to local storage and apply it.
 * This function updates the local storage with the selected theme
 * and applies the theme to the page.
 * @param {string} theme - The selected theme ('dark', 'light', or 'auto').
 */
function saveTheme(theme) {
  localStorage.setItem('theme', theme);
  settings.theme = theme;
  applyTheme();
}

/**
 * Load the difficulty setting from local storage.
 */
function loadSettings() {
  const storedDifficulty = localStorage.getItem('difficulty');
  const storedTheme = localStorage.getItem('theme');

  settings.difficulty = storedDifficulty || 'normal';
  settings.theme = storedTheme || 'auto';

  // Reflect difficulty
  const difficultyRadio = document.querySelector(`input[name="difficultyToggle"][value="${settings.difficulty}"]`);
  if (difficultyRadio) difficultyRadio.checked = true;

  // Reflect theme
  const themeRadio = document.querySelector(`input[name="themeToggle"][value="${settings.theme}"]`);
  if (themeRadio) themeRadio.checked = true;
}

/**
 * Save the selected difficulty to local storage.
 * @param {string} difficulty - The selected difficulty ('easy', 'normal', or 'hard').
 */
function saveDifficulty(difficulty) {
  const valid = ['easy', 'normal', 'hard'];
  if (!valid.includes(difficulty)) {
    console.warn('Invalid difficulty level:', difficulty);
    return;
  }

  localStorage.setItem('difficulty', difficulty);
  settings.difficulty = difficulty;

  const radio = document.querySelector(`input[name="difficultyToggle"][value="${difficulty}"]`);
  if (radio) radio.checked = true;
}

/**
 * Show a welcome modal to the user.
 */
function welcomeModal() {
  const hasDisabledModal = localStorage.getItem('kword-modal-disabled');

  if (!hasDisabledModal) {
    const modal = new bootstrap.Modal(document.getElementById('welcomeModal'));
    modal.show();
  }

  document.getElementById('dont-show').addEventListener('click', function () {
    localStorage.setItem('kword-modal-disabled', 'true');
  });
}

/**
 * Render the statistics in the modal.
 * This function retrieves the current streak, maximum streak,
 * total attempts, correct answers, and win rate from local storage
 * and updates the DOM elements in the modal.
 */
function renderStatsInModal() {
  const currentStreak = parseInt(localStorage.getItem('currentStreak') || '0');
  const maxStreak = parseInt(localStorage.getItem('maxStreak') || '0');
  const totalAttempts = parseInt(localStorage.getItem('totalAttempts') || '0');
  const correctAnswers = parseInt(localStorage.getItem('correctAnswers') || '0');
  const wrongAnswers = totalAttempts - correctAnswers;
  const wordsPlayed = correctAnswers + wrongAnswers;
  const winRate = totalAttempts > 0 ? ((correctAnswers / totalAttempts) * 100).toFixed(1) + '%' : '0%';

  document.getElementById('modalCurrentStreak').textContent = currentStreak;
  document.getElementById('modalMaxStreak').textContent = maxStreak;
  document.getElementById('modalCorrectAnswers').textContent = correctAnswers;
  document.getElementById('modalWrongAnswers').textContent = wrongAnswers;
  document.getElementById('modalWordsPlayed').textContent = wordsPlayed;
  document.getElementById('modalWinRate').textContent = winRate;
}

/**
 * Update the statistics in local storage.
 * This function increments the total attempts and correct answers
 * if the answer is correct.
 * It also updates the current streak and maximum streak.
 * @param {boolean} isCorrect - Whether the answer is correct or not.
 */
function updateStats(isCorrect) {
  let currentStreak = parseInt(localStorage.getItem('currentStreak') || '0');
  let maxStreak = parseInt(localStorage.getItem('maxStreak') || '0');
  let totalAttempts = parseInt(localStorage.getItem('totalAttempts') || '0');
  let correctAnswers = parseInt(localStorage.getItem('correctAnswers') || '0');

  totalAttempts++;

  if (isCorrect) {
    currentStreak++;
    correctAnswers++;
    if (currentStreak > maxStreak) maxStreak = currentStreak;
  } else {
    currentStreak = 0;
  }

  localStorage.setItem('currentStreak', currentStreak);
  localStorage.setItem('maxStreak', maxStreak);
  localStorage.setItem('totalAttempts', totalAttempts);
  localStorage.setItem('correctAnswers', correctAnswers);
}

/**
 * Reset the statistics event listener.
 * This function adds an event listener to the reset button
 * that confirms the action and resets the statistics in local storage.
 * It also refreshes the modal display and updates the streak display.
 */
function resetStatsEventListener() {
    document.getElementById('resetStatsBtn').addEventListener('click', function () {
    const confirmed = confirm("Are you sure you want to delete all your stats?");
    if (confirmed) {
      localStorage.removeItem('currentStreak');
      localStorage.removeItem('maxStreak');
      localStorage.removeItem('totalAttempts');
      localStorage.removeItem('correctAnswers');

      renderStatsInModal(); // Refresh modal display
      renderStreaks(); // Optional: refresh main UI
    }
  });
}

/**
 * Change difficulty event listener.
 */
function changeDifficultyEventListener() {
  document.querySelectorAll('input[name="difficultyToggle"]').forEach(el => {
    el.addEventListener('change', (e) => {
      const selected = e.target.value;
      saveDifficulty(selected);       // Save to settings and localStorage

      // Show message to user
      showDifficultyMessage(selected);
    });
  });
}


/**
 * Show a message to the user when the difficulty is changed.
 * @param {string} level - The selected difficulty level ('easy', 'normal', or 'hard').
 */
function showDifficultyMessage(level) {
  const messageBox = document.getElementById('difficultyMessage');
  messageBox.innerHTML = `✅ Difficulty set to <strong>${capitalize(level)}</strong>. It will apply to the next word.`;
  messageBox.style.display = 'block';

  // Hide the message after 7 seconds
  setTimeout(() => {
    messageBox.style.display = 'none';
  }, 7000);
}

/**
 * Capitalize the first letter of a word.
 * @param {string} word - The word to capitalize.
 */
function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Share the statistics event listener.
 * This function adds an event listener to the share button
 * that retrieves the statistics from local storage and shares them
 * using the Web Share API or copies them to the clipboard.
 * It also handles the fallback for browsers that do not support the Web Share API.
 */
function shareStatsEventListener() {
  document.getElementById('shareStatsBtn').addEventListener('click', () => {
  const currentStreak = localStorage.getItem('currentStreak') || '0';
  const maxStreak = localStorage.getItem('maxStreak') || '0';
  const totalAttempts = parseInt(localStorage.getItem('totalAttempts') || '0');
  const correctAnswers = parseInt(localStorage.getItem('correctAnswers') || '0');
  const wrongAnswers = totalAttempts - correctAnswers;
  const wordsPlayed = correctAnswers + wrongAnswers;
  const winRate = totalAttempts > 0 ? ((correctAnswers / totalAttempts) * 100).toFixed(1) + '%' : '0%';

  let shareText = `📊 ${SITE_NAME} Stats:
🔥 Current Streak: ${currentStreak}
🏆 Max Streak: ${maxStreak}
✅ Correct Answers: ${correctAnswers}
❌ Wrong Attempts: ${wrongAnswers}
🎮 Words Played: ${wordsPlayed}
📈 Win Rate: ${winRate}`;

  if (navigator.share) {
    navigator.share({
      title: `My ${SITE_NAME} Stats`,
      text: shareText,
      url: SITE_URL
    }).catch((err) => console.log('Share failed:', err));
  } else {
    // Add URL to the share text
    shareText = `${shareText}\n\nPlay ${SITE_NAME}: ${SITE_URL}`;

    navigator.clipboard.writeText(shareText)
      .then(() => alert('📋 Stats copied to clipboard!'))
      .catch(() => alert('❌ Failed to copy stats.'));
  }
});
}

/**
 * Switch between modals.
 * This function hides the current modal and shows the target modal.
 * It also ensures that the target modal is shown only after the current modal is fully hidden.
 */
function switchModal(fromId, toId) {
  const fromModalEl = document.getElementById(fromId);
  const toModalEl = document.getElementById(toId);

  const fromModal = bootstrap.Modal.getInstance(fromModalEl);
  fromModal.hide();

  fromModalEl.addEventListener('hidden.bs.modal', function onHidden() {
    fromModalEl.removeEventListener('hidden.bs.modal', onHidden);
    const toModal = new bootstrap.Modal(toModalEl);
    toModal.show();
  });
}

/**
 * Render the current year on the page.
 * This function retrieves the current year and updates the DOM element.
 */
function renderYear() {
  const year = new Date().getFullYear();
  document.getElementById('year').textContent = year;
}

// load CSV
loadCSV()
  .then(data => {
    // Parse CSV data into entries
    csvEntries = parseCSV(data);
    console.log('Dictionary data loaded successfully');
    play();
    welcomeModal();
  })
  .catch(error => {
    console.error('Error loading CSV:', error);
  });

// Show the current year
renderYear()

// Check result
// if the form is submitted, check the answer
document.getElementById('word-form').addEventListener('submit', function(event) {
  event.preventDefault();

  const word = document.getElementById('word-input').value;

  if (!hasInputChanged(word)) {
    console.log('Input has not changed — ignoring submission');
    return;
  }

  lastSubmittedValue = sanitizeText(word);
  checkAnswer(word);
  disableSubmit();
});

// Input change handler
document.getElementById('word-input').addEventListener('input', function () {
  if (hasInputChanged(this.value)) {
    enableSubmit();
  }
});

// Play again
document.getElementById('play-again-form').addEventListener('submit', function(event) {
  event.preventDefault();
  play();
});

// Theme toggle
const selected = document.querySelector(`input[name="themeToggle"][value="${settings.theme}"]`);
if (selected) selected.checked = true;

document.querySelectorAll('input[name="themeToggle"]').forEach(btn => {
  btn.addEventListener('change', (e) => {
    saveTheme(e.target.value);
  });
});

// Re-apply on system theme change if in auto mode
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  applyTheme();
});

// Load settings
loadSettings();

// Initial theme load
applyTheme();

// Stats rendering when modal is shown
const statsModal = document.getElementById('statsModal');
statsModal.addEventListener('show.bs.modal', renderStatsInModal);

// Event listeners
resetStatsEventListener();
shareStatsEventListener()
changeDifficultyEventListener()

// Update attempt display
currentAttempt = parseInt(localStorage.getItem('currentAttempt') || recordAttempt())
updateAttemptDisplay(currentAttempt);

// Open hint from help modal
document.getElementById('openHintFromHelp').addEventListener('click', function (e) {
  e.preventDefault();
  switchModal('welcomeModal', 'hintModal');
});

// Checks for enter stroke
document.addEventListener('keydown', function (event) {
  if (event.key === 'Enter' && submitted === true) {
    play()
  }
});
