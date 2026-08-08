const STORAGE_KEY = "gameAccounts";
const API_BASE_URL = window.API_BASE_URL || "";
const apiUrl = (path) => `${API_BASE_URL}${path}`;
const accountForm = document.getElementById("account-form");
const gameNameInput = document.getElementById("game-name");
const gameSuggestions = document.getElementById("game-suggestions");
const userIdInput = document.getElementById("user-id");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const notesInput = document.getElementById("notes");
const searchInput = document.getElementById("search-query");
const accountList = document.getElementById("account-list");
const clearStorageButton = document.getElementById("clear-storage");
const exportDataButton = document.getElementById("export-data");
const importDataButton = document.getElementById("import-data");
const importFileInput = document.getElementById("import-file");
const authForm = document.getElementById("auth-form");
const authUsernameInput = document.getElementById("auth-username");
const authEmailInput = document.getElementById("auth-email");
const authEmailField = document.getElementById("auth-email-field");
const authPasswordInput = document.getElementById("auth-password");
const loginTab = document.getElementById("login-tab");
const registerTab = document.getElementById("register-tab");
const authPasswordToggle = document.getElementById("auth-password-toggle");
const authConfirmPasswordInput = document.getElementById("auth-confirm-password");
const confirmPasswordField = document.getElementById("confirm-password-field");
const passwordStrength = document.getElementById("password-strength");
const loginButton = document.getElementById("login-button");
const forgotPasswordButton = document.getElementById("forgot-password");
const logoutButton = document.getElementById("logout-button");
const loggedOutView = document.getElementById("logged-out-view");
const loggedInView = document.getElementById("logged-in-view");
const currentUsername = document.getElementById("current-username");
const authMessage = document.getElementById("auth-message");
const appContent = document.getElementById("app-content");
const authSection = document.getElementById("auth-section");
const deleteModal = document.getElementById("delete-modal");
const deleteModalTitle = document.getElementById("delete-modal-title");
const deleteModalMessage = document.getElementById("delete-modal-message");
const cancelDeleteButton = document.getElementById("cancel-delete");
const confirmDeleteButton = document.getElementById("confirm-delete");
const inputModal = document.getElementById("input-modal");
const inputModalForm = document.getElementById("input-modal-form");
const inputModalTitle = document.getElementById("input-modal-title");
const inputModalMessage = document.getElementById("input-modal-message");
const inputModalFields = document.getElementById("input-modal-fields");
const cancelInputModal = document.getElementById("cancel-input-modal");

let showAllPasswords = false;
let editingIndex = null;
let currentUser = null;
let accountsCache = [];
let authMode = "login";
let pendingDeleteIndex = null;
let pendingClearAll = false;
let inputModalResolver = null;

function setAppAccess(enabled) {
  appContent.hidden = !enabled;
  authSection.hidden = enabled;
  accountForm.querySelectorAll("input, button").forEach((element) => {
    element.disabled = !enabled;
  });
  searchInput.disabled = !enabled;
}

function loadAccounts() {
  return accountsCache;
}

function saveAccounts(accounts) {
  accountsCache = accounts;
  if (currentUser) {
    fetch(apiUrl("/api/accounts"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(accounts),
    }).then((response) => {
      if (!response.ok) throw new Error("Save failed");
    }).catch(() => {
      authMessage.textContent = "Unable to save changes to the database.";
    });
  }
}

async function authenticate(mode) {
  authMessage.textContent = "";
  if (mode === "register" && authPasswordInput.value !== authConfirmPasswordInput.value) {
    authMessage.textContent = "Passwords do not match.";
    authConfirmPasswordInput.focus();
    return;
  }
  const response = await fetch(apiUrl(`/api/auth/${mode}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: authUsernameInput.value.trim(), email: authEmailInput.value.trim(), password: authPasswordInput.value }),
  });
  const data = await response.json();
  if (!response.ok) {
    authMessage.textContent = data.error || "Authentication failed.";
    return;
  }
  if (mode === "register") {
    authForm.reset();
    setAuthMode("login");
    authMessage.textContent = data.message;
    return;
  }
  currentUser = data;
  const accountsResponse = await fetch(apiUrl("/api/accounts"));
  accountsCache = await accountsResponse.json();
  currentUsername.textContent = currentUser.username;
  loggedOutView.hidden = true;
  loggedInView.hidden = false;
  setAppAccess(true);
  authForm.reset();
  renderAccounts(searchInput.value);
  renderGameNameSuggestions();
}

async function checkAuthentication() {
  const response = await fetch(apiUrl("/api/auth/me"));
  currentUser = await response.json();
  if (currentUser) {
    const accountsResponse = await fetch(apiUrl("/api/accounts"));
    accountsCache = await accountsResponse.json();
    currentUsername.textContent = currentUser.username;
    loggedOutView.hidden = true;
    loggedInView.hidden = false;
    setAppAccess(true);
    renderAccounts();
  }
}

async function logout() {
  await fetch(apiUrl("/api/auth/logout"), { method: "POST" });
  currentUser = null;
  accountsCache = [];
  loggedOutView.hidden = false;
  loggedInView.hidden = true;
  setAppAccess(false);
  renderAccounts();
}

function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === "register";
  loginTab.classList.toggle("active", !registering);
  registerTab.classList.toggle("active", registering);
  loginTab.setAttribute("aria-selected", String(!registering));
  registerTab.setAttribute("aria-selected", String(registering));
  loginButton.textContent = registering ? "Create my vault" : "Sign in to vault";
  authPasswordInput.autocomplete = registering ? "new-password" : "current-password";
  confirmPasswordField.hidden = !registering;
  authConfirmPasswordInput.required = registering;
  authEmailField.hidden = !registering;
  authEmailInput.required = registering;
  forgotPasswordButton.hidden = registering;
  authMessage.textContent = "";
  updatePasswordStrength();
  authMessage.textContent = "";
}

function toggleAuthPassword() {
  const visible = authPasswordInput.type === "text";
  authPasswordInput.type = visible ? "password" : "text";
  authPasswordToggle.textContent = visible ? "Show" : "Hide";
  authPasswordToggle.setAttribute("aria-label", visible ? "Show password" : "Hide password");
}

function updatePasswordStrength() {
  const password = authPasswordInput.value;
  if (!password || authMode === "login") {
    passwordStrength.textContent = "";
    passwordStrength.className = "password-strength";
    return;
  }
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong"];
  passwordStrength.textContent = `Password strength: ${labels[score]}`;
  passwordStrength.className = `password-strength strength-${score}`;
}

async function requestPasswordReset() {
  const values = await askForInput("Reset your password", "Enter the username and Gmail address used for your account.", [
    { name: "username", label: "Username", type: "text" },
    { name: "email", label: "Gmail address", type: "email" },
  ]);
  if (!values) return;
  const response = await fetch(apiUrl("/api/auth/forgot-password"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: values.username.trim(), email: values.email.trim() }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Password reset request failed.");
  authMessage.textContent = data.message || data.error;
}

async function handlePasswordResetLink() {
  const token = new URLSearchParams(window.location.search).get("reset");
  if (!token) return;
  const values = await askForInput("Change your password", "Choose and confirm your new password.", [
    { name: "password", label: "New password", type: "password" },
    { name: "confirmPassword", label: "Confirm new password", type: "password" },
  ]);
  if (!values) return;
  if (values.password !== values.confirmPassword) {
    authMessage.textContent = "New passwords do not match.";
    return;
  }
  const response = await fetch(apiUrl("/api/auth/reset-password"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, ...values }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Password reset failed.");
  setAuthMode("login");
  authUsernameInput.focus();
  authMessage.textContent = data.message || data.error;
  window.history.replaceState({}, "", window.location.pathname);
}

function askForInput(title, message, fields) {
  return new Promise((resolve) => {
    inputModalResolver = resolve;
    inputModalTitle.textContent = title;
    inputModalMessage.textContent = message;
    inputModalFields.innerHTML = fields.map((field) => `
      <div class="input-modal-field">
        <label for="input-${field.name}">${field.label}</label>
        <input id="input-${field.name}" name="${field.name}" type="${field.type}" required />
      </div>
    `).join("");
    inputModal.hidden = false;
    inputModalFields.querySelector("input").focus();
  });
}

function closeInputModal(value = null) {
  inputModal.hidden = true;
  if (inputModalResolver) inputModalResolver(value);
  inputModalResolver = null;
}

function getGameNameOptions() {
  const accounts = loadAccounts();
  return [...new Set(accounts.map((account) => account.game).filter(Boolean))].sort();
}

function renderGameNameSuggestions(filter = "") {
  const query = filter.trim().toLowerCase();
  const names = getGameNameOptions().filter((name) => !query || name.toLowerCase().includes(query));
  gameSuggestions.innerHTML = "";

  if (names.length === 0) {
    const message = document.createElement("div");
    message.className = "suggestion-item empty";
    message.textContent = query ? "No matching saved games" : "No saved game names yet";
    gameSuggestions.appendChild(message);
  } else {
    names.forEach((name) => {
      const item = document.createElement("div");
      item.className = "suggestion-item";
      item.textContent = name;
      item.addEventListener("click", () => {
        gameNameInput.value = name;
        gameSuggestions.classList.remove("visible");
      });
      gameSuggestions.appendChild(item);
    });
  }

  gameSuggestions.classList.add("visible");
}

function renderAccounts(filter = "") {
  const accounts = loadAccounts();
  const query = filter.trim().toLowerCase();
  const filteredAccounts = accounts
    .map((account, index) => ({ account, index }))
    .filter(({ account }) => {
      if (!query) return true;
      return [account.game, account.userId, account.email, account.password, account.notes]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));
    });

  accountList.innerHTML = "";

  if (filteredAccounts.length === 0) {
    accountList.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">${query ? "No accounts match your search." : "No accounts saved yet."}${query ? "" : "<br><small>Add your first game account above to start your cozy vault.</small>"}</td>
      </tr>
    `;
    return;
  }

  filteredAccounts.forEach(({ account, index }) => {
    const passwordVisible = showAllPasswords;
    const passwordText = passwordVisible ? account.password : "••••••••";
    const passwordButtonText = passwordVisible ? "Hide" : "Show";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${account.game}</td>
      <td class="copyable" data-copy="userId" data-index="${index}">${account.userId}</td>
      <td class="copyable" data-copy="email" data-index="${index}">${account.email || "—"}</td>
      <td class="password-cell">
        <span class="password-mask copyable" data-copy="password" data-index="${index}" data-visible="${passwordVisible}">${passwordText}</span>
        <button class="toggle-password" type="button" data-index="${index}">${passwordButtonText}</button>
      </td>
      <td>${account.notes || "—"}</td>
      <td class="action-cell">
        <button class="edit-button" type="button" data-index="${index}" aria-label="Edit account" title="Edit account">✎</button>
        <button class="delete-button" type="button" data-index="${index}" aria-label="Delete account" title="Delete account">🗑</button>
      </td>
    `;
    accountList.appendChild(row);
  });
}

function copyAccountField(index, field, cell) {
  const accounts = loadAccounts();
  const account = accounts[index];
  if (!account || !account[field]) {
    return;
  }

  navigator.clipboard.writeText(account[field]).then(() => {
    if (cell) {
      cell.classList.add("copied");
      setTimeout(() => {
        cell.classList.remove("copied");
      }, 800);
    }
  }).catch(() => {
    alert("Unable to copy to clipboard.");
  });
}

function togglePasswordVisibility(index, button) {
  const passwordSpan = accountList.querySelector(`.password-mask[data-index="${index}"]`);
  if (!passwordSpan) {
    return;
  }

  const visible = passwordSpan.dataset.visible === "true";
  const accounts = loadAccounts();
  const account = accounts[index];
  if (!account) {
    return;
  }

  if (visible) {
    passwordSpan.textContent = "••••••••";
    passwordSpan.dataset.visible = "false";
    button.textContent = "Show";
  } else {
    passwordSpan.textContent = account.password;
    passwordSpan.dataset.visible = "true";
    button.textContent = "Hide";
  }
}

function addAccount(event) {
  event.preventDefault();

  const newAccount = {
    game: gameNameInput.value.trim(),
    userId: userIdInput.value.trim(),
    email: emailInput.value.trim(),
    password: passwordInput.value.trim(),
    notes: notesInput.value.trim(),
  };

  if (!newAccount.game || !newAccount.userId || !newAccount.password) {
    return;
  }

  const accounts = loadAccounts();
  if (editingIndex === null) {
    accounts.push(newAccount);
  } else {
    accounts[editingIndex] = newAccount;
    editingIndex = null;
  }
  saveAccounts(accounts);
  renderAccounts(searchInput.value);
  if (document.activeElement === gameNameInput) {
    renderGameNameSuggestions(gameNameInput.value);
  }
  accountForm.reset();
  accountForm.querySelector('button[type="submit"]').textContent = "Save Account";
}

function editAccount(index) {
  const account = loadAccounts()[index];
  if (!account) {
    return;
  }

  editingIndex = index;
  gameNameInput.value = account.game;
  userIdInput.value = account.userId;
  emailInput.value = account.email;
  passwordInput.value = account.password;
  notesInput.value = account.notes;
  accountForm.querySelector('button[type="submit"]').textContent = "Update Account";
  accountForm.scrollIntoView({ behavior: "smooth", block: "start" });
  gameNameInput.focus();
}

function deleteAccount(index) {
  const account = loadAccounts()[index];
  if (!account) {
    return;
  }
  pendingDeleteIndex = index;
  pendingClearAll = false;
  deleteModalTitle.textContent = "Delete this account?";
  deleteModalMessage.textContent = `“${account.game}” will be removed from your vault. This cannot be undone.`;
  deleteModal.hidden = false;
  cancelDeleteButton.focus();
}

function closeDeleteModal() {
  pendingDeleteIndex = null;
  pendingClearAll = false;
  deleteModal.hidden = true;
}

function confirmDelete() {
  if (pendingClearAll) {
    saveAccounts([]);
    renderAccounts(searchInput.value);
    renderGameNameSuggestions();
    closeDeleteModal();
    return;
  }
  if (pendingDeleteIndex === null) return;
  const accounts = loadAccounts();
  accounts.splice(pendingDeleteIndex, 1);
  saveAccounts(accounts);
  renderAccounts(searchInput.value);
  renderGameNameSuggestions(gameNameInput.value);
  closeDeleteModal();
}

function exportAccounts() {
  const accounts = loadAccounts();
  const fileContents = JSON.stringify(accounts, null, 2);
  const blob = new Blob([fileContents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "game-accounts.json";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function importAccounts(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported)) {
        throw new Error("Invalid file format");
      }

      const sanitized = imported
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          game: String(item.game || "").trim(),
          userId: String(item.userId || "").trim(),
          email: String(item.email || "").trim(),
          password: String(item.password || "").trim(),
          notes: String(item.notes || "").trim(),
        }))
        .filter((account) => account.game && account.userId && account.password);

      if (sanitized.length === 0) {
        alert("No valid accounts found in the file.");
        return;
      }

      const accounts = loadAccounts();
      saveAccounts([...accounts, ...sanitized]);
      renderAccounts(searchInput.value);
      renderGameNameSuggestions(gameNameInput.value);
      alert(`${sanitized.length} account(s) imported successfully.`);
    } catch (error) {
      alert("Unable to import accounts. Please use a valid JSON export file.");
    }
  };
  reader.readAsText(file);
}

function clearAllAccounts() {
  if (loadAccounts().length === 0) {
    return;
  }
  pendingClearAll = true;
  pendingDeleteIndex = null;
  deleteModalTitle.textContent = "Clear all accounts?";
  deleteModalMessage.textContent = "Every saved game account will be permanently removed from your vault.";
  deleteModal.hidden = false;
  cancelDeleteButton.focus();
}

authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  authenticate(authMode).catch(() => {
    authMessage.textContent = "Unable to connect to the server.";
  });
});
loginTab.addEventListener("click", () => setAuthMode("login"));
registerTab.addEventListener("click", () => setAuthMode("register"));
authPasswordToggle.addEventListener("click", toggleAuthPassword);
authPasswordInput.addEventListener("input", updatePasswordStrength);
forgotPasswordButton.addEventListener("click", () => requestPasswordReset().catch((error) => {
  authMessage.textContent = error.message || "Unable to contact the email service.";
}));
authConfirmPasswordInput.addEventListener("input", () => {
  if (authMode === "register" && authConfirmPasswordInput.value && authPasswordInput.value !== authConfirmPasswordInput.value) {
    authMessage.textContent = "Passwords do not match.";
  } else if (authMessage.textContent === "Passwords do not match.") {
    authMessage.textContent = "";
  }
});
logoutButton.addEventListener("click", logout);
inputModalForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(inputModalForm).entries());
  closeInputModal(values);
});
cancelInputModal.addEventListener("click", () => closeInputModal());
cancelDeleteButton.addEventListener("click", closeDeleteModal);
confirmDeleteButton.addEventListener("click", confirmDelete);
deleteModal.addEventListener("click", (event) => {
  if (event.target === deleteModal) closeDeleteModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !deleteModal.hidden) closeDeleteModal();
});
accountForm.addEventListener("submit", addAccount);
searchInput.addEventListener("input", () => renderAccounts(searchInput.value));
gameNameInput.addEventListener("input", () => renderGameNameSuggestions(gameNameInput.value));
gameNameInput.addEventListener("focus", () => renderGameNameSuggestions(gameNameInput.value));
document.addEventListener("click", (event) => {
  if (!event.target.closest(".dropdown-wrapper")) {
    gameSuggestions.classList.remove("visible");
  }
});
accountList.addEventListener("click", (event) => {
  const toggleButton = event.target.closest(".toggle-password");
  if (toggleButton) {
    togglePasswordVisibility(Number(toggleButton.dataset.index), toggleButton);
    return;
  }

  const editButton = event.target.closest(".edit-button");
  if (editButton) {
    editAccount(Number(editButton.dataset.index));
    return;
  }

  const deleteButton = event.target.closest(".delete-button");
  if (deleteButton) {
    deleteAccount(Number(deleteButton.dataset.index));
    return;
  }

  const copyable = event.target.closest(".copyable");
  if (copyable) {
    copyAccountField(Number(copyable.dataset.index), copyable.dataset.copy, copyable);
  }
});
clearStorageButton.addEventListener("click", clearAllAccounts);

exportDataButton.addEventListener("click", exportAccounts);
importDataButton.addEventListener("click", () => importFileInput.click());

importFileInput.addEventListener("change", (event) => {
  const file = event.target.files && event.target.files[0];
  if (file) {
    importAccounts(file);
  }
  event.target.value = "";
});

setAppAccess(false);
renderAccounts();
checkAuthentication().catch(() => {
  authMessage.textContent = "Start the server to use login and database storage.";
});
handlePasswordResetLink().catch(() => {
  authMessage.textContent = "Unable to reset your password right now.";
});
