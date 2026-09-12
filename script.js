(() => {
  "use strict";

  const screens = [...document.querySelectorAll(".screen")];
  const missionBar = document.getElementById("missionBar");
  const progressTrack = document.querySelector(".progress-track");
  const progressFill = document.getElementById("progressFill");
  const stepLabel = document.getElementById("stepLabel");
  const scoreValue = document.getElementById("scoreValue");
  const toast = document.getElementById("toast");
  const awarded = new Set();
  const categoryMax = { keys: 1000, typing: 1000, correction: 1000, symbols: 1000, shortcuts: 1000, bonus: 600 };
  const categoryLabels = { keys: "Repérage", typing: "Saisie exacte", correction: "Correction", symbols: "Caractères spéciaux", shortcuts: "Raccourcis", bonus: "Bonus chrono" };

  const state = {
    screen: "welcome",
    score: 0,
    grossScores: { keys: 0, typing: 0, correction: 0, symbols: 0, shortcuts: 0, bonus: 0 },
    penalties: { keys: 0, typing: 0, correction: 0, symbols: 0, shortcuts: 0, bonus: 0 },
    mistakes: { keys: 0, typing: 0, correction: 0, symbols: 0, shortcuts: 0, bonus: 0 },
    pendingPenalty: null,
    keyIndex: 0,
    typingIndex: 0,
    correctionIndex: 0,
    correctionKeys: {},
    symbolIndex: 0,
    selectedModifier: null,
    shortcutIndex: 0,
    bonusIndex: 0,
    bonusSeconds: 60,
    bonusStarted: false,
    bonusFinished: false,
    bonusCodes: 0,
    timer: null
  };

  const screenOrder = ["challenge1", "challenge2", "challenge3", "challenge4", "challenge5", "bonus"];

  function categoryFromId(id) {
    if (id.startsWith("key")) return "keys";
    if (id.startsWith("typing")) return "typing";
    if (id.startsWith("correction")) return "correction";
    if (id.startsWith("symbol")) return "symbols";
    if (id.startsWith("shortcut")) return "shortcuts";
    if (id.startsWith("bonus")) return "bonus";
    return null;
  }

  function categoryScore(category) {
    return Math.max(0, state.grossScores[category] - state.penalties[category]);
  }

  function renderRunningScore(animation = "gain") {
    state.score = Object.keys(categoryMax).reduce((total, category) => total + categoryScore(category), 0);
    scoreValue.textContent = String(state.score);
    const color = animation === "loss" ? "#ff5d73" : "#ffffff";
    scoreValue.animate?.([
      { transform: "scale(1)", color: "#ffb627" },
      { transform: "scale(1.35)", color },
      { transform: "scale(1)", color: "#ffb627" }
    ], { duration: 360 });
  }

  function addScore(id, points) {
    if (awarded.has(id)) return;
    awarded.add(id);
    const category = categoryFromId(id);
    if (category) state.grossScores[category] += points;
    renderRunningScore("gain");
  }

  function applyPenalty(category, points) {
    const cap = category === "bonus" ? 300 : 500;
    const available = Math.max(0, cap - state.penalties[category]);
    const applied = Math.min(points, available);
    state.mistakes[category] += 1;
    if (applied > 0) {
      state.penalties[category] += applied;
      renderRunningScore("loss");
      showToast(`Erreur notée : –${applied} pts en ${categoryLabels[category]}`);
    } else {
      showToast(`Erreur notée · malus maximal atteint pour ce défi`);
    }
    state.pendingPenalty = applied;
    return applied;
  }

  function setFeedback(element, message, kind = "info") {
    element.classList.remove("success", "error", "with-penalty");
    if (kind !== "info") element.classList.add(kind);
    if (kind === "error" && state.pendingPenalty !== null) {
      const penaltyText = state.pendingPenalty > 0 ? `–${state.pendingPenalty} pts` : "malus maximal";
      element.classList.add("with-penalty");
      element.innerHTML = `<span>${message}</span><strong class="feedback-penalty">${penaltyText}</strong>`;
      state.pendingPenalty = null;
    } else {
      element.innerHTML = message;
    }
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => toast.classList.remove("show"), 2100);
  }

  function protectManualEntry(input, category, feedback, message) {
    let lastBlockedAt = 0;
    const blockInsertion = event => {
      event.preventDefault();
      const now = Date.now();
      if (now - lastBlockedAt < 450) return;
      lastBlockedAt = now;
      applyPenalty(category, 25);
      input.classList.add("input-bad");
      window.setTimeout(() => input.classList.remove("input-bad"), 650);
      setFeedback(feedback, message, "error");
    };

    input.addEventListener("paste", blockInsertion);
    input.addEventListener("drop", blockInsertion);
    input.addEventListener("beforeinput", event => {
      if (event.inputType === "insertFromPaste" || event.inputType === "insertFromDrop") blockInsertion(event);
    });
  }

  function showScreen(id) {
    if (state.screen === "bonus" && id !== "bonus" && state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
    state.screen = id;
    screens.forEach(screen => screen.classList.toggle("is-active", screen.id === id));
    const index = screenOrder.indexOf(id);
    const inMission = index >= 0;
    missionBar.hidden = !inMission;
    if (inMission) {
      const percent = Math.round((index / screenOrder.length) * 100);
      progressFill.style.width = `${percent}%`;
      progressTrack.setAttribute("aria-valuenow", String(percent));
      stepLabel.textContent = index === 5 ? "Bonus + bilan" : `Défi ${index + 1} sur 5`;
    }
    if (id === "final") {
      missionBar.hidden = false;
      progressFill.style.width = "100%";
      progressTrack.setAttribute("aria-valuenow", "100");
      stepLabel.textContent = "Mission terminée";
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.getElementById(id)?.querySelector("h1")?.focus?.({ preventScroll: true });
  }

  document.getElementById("startButton").addEventListener("click", () => showScreen("challenge1"));
  document.getElementById("homeButton").addEventListener("click", () => showScreen("welcome"));
  document.querySelectorAll("[data-action='home']").forEach(button => button.addEventListener("click", () => showScreen("welcome")));
  document.querySelectorAll("[data-action='previous']").forEach(button => {
    button.addEventListener("click", () => {
      const index = screenOrder.indexOf(state.screen);
      if (state.screen === "bonus" && !state.bonusFinished) resetBonus();
      showScreen(screenOrder[Math.max(0, index - 1)]);
    });
  });

  // Défi 1 — repérage des touches
  const keyTasks = [
    { key: "enter", name: "Entrée", tip: "Elle valide une action ou va à la ligne." },
    { key: "shift", name: "Maj", tip: "Garde-la enfoncée pour une seule majuscule." },
    { key: "backspace", name: "Retour arrière", tip: "Elle efface le caractère situé à gauche du curseur." },
    { key: "delete", name: "Suppr", tip: "Elle efface le caractère situé à droite du curseur." },
    { key: "ctrl", name: "Ctrl", tip: "Elle se combine avec une lettre pour former un raccourci." },
    { key: "altgr", name: "Alt Gr", tip: "Elle produit le troisième signe d’une touche, comme @ ou €." },
    { key: "capslock", name: "Verr. Maj", tip: "Elle garde les majuscules activées jusqu’au prochain appui." },
    { key: "shift", name: "Maj", prompt: "Pixel veut écrire <strong>une seule majuscule</strong>. Clique sur la touche qu’il doit garder enfoncée.", tip: "Exact : Maj agit seulement pendant que tu la gardes enfoncée." },
    { key: "capslock", name: "Verr. Maj", prompt: "Pixel veut écrire <strong>plusieurs mots en majuscules</strong>. Clique sur la touche qui reste active.", tip: "Exact : Verr. Maj reste active jusqu’à ce que tu appuies de nouveau dessus." }
  ];
  const keyPrompt = document.getElementById("keyPrompt");
  const keyStep = document.getElementById("keyStep");
  const keyFeedback = document.getElementById("keyFeedback");
  const keyNext = document.getElementById("keyNext");

  function updateKeyTask() {
    document.querySelectorAll("#keyFinder .key").forEach(key => key.classList.remove("is-target", "is-wrong"));
    const task = keyTasks[state.keyIndex];
    if (!task) {
      keyPrompt.innerHTML = "Toutes les touches importantes sont repérées. <strong>Défi validé !</strong>";
      keyStep.textContent = "✓";
      keyNext.disabled = false;
      addScore("keys-complete", 100);
      setFeedback(keyFeedback, "Excellent repérage ! Tu as distingué <strong>Maj</strong>, qui agit une fois, et <strong>Verr. Maj</strong>, qui reste actif.", "success");
      return;
    }
    keyStep.textContent = String(state.keyIndex + 1);
    keyPrompt.innerHTML = task.prompt || `Clique sur la touche <strong>${task.name}</strong>.`;
    document.querySelectorAll(`#keyFinder [data-key="${task.key}"]`).forEach(key => key.classList.add("is-target"));
  }

  document.getElementById("keyFinder").addEventListener("click", event => {
    const button = event.target.closest("[data-key]");
    if (!button || state.keyIndex >= keyTasks.length) return;
    const task = keyTasks[state.keyIndex];
    if (button.dataset.key !== task.key) {
      applyPenalty("keys", 25);
      button.classList.add("is-wrong");
      window.setTimeout(() => button.classList.remove("is-wrong"), 450);
      setFeedback(keyFeedback, `Ce n’est pas <strong>${task.name}</strong>. Observe le nom écrit sur les grandes touches.`, "error");
      return;
    }
    document.querySelectorAll(`#keyFinder [data-key="${task.key}"]`).forEach(key => {
      key.classList.remove("is-target");
      key.classList.add("is-found");
    });
    addScore(`key-${state.keyIndex}`, 100);
    setFeedback(keyFeedback, `<strong>Oui !</strong> ${task.tip}`, "success");
    state.keyIndex += 1;
    window.setTimeout(updateKeyTask, 520);
  });
  keyNext.addEventListener("click", () => showScreen("challenge2"));
  updateKeyTask();

  // Défi 2 — saisie exacte
  const typingTasks = [
    "Élève n°6 : prénom.nom@college.example - 12,50 € / 20 ?",
    "A 8 h 30, Zoé ouvre le fichier \"Défi-2.odt\".",
    "Code final : AZERTY / sécurisé ? Oui !"
  ];
  const typingModel = document.getElementById("typingModel");
  const typingInput = document.getElementById("typingInput");
  const typingRound = document.getElementById("typingRound");
  const typingCounter = document.getElementById("typingCounter");
  const typingCompare = document.getElementById("typingCompare");
  const typingFeedback = document.getElementById("typingFeedback");
  const typingValidate = document.getElementById("typingValidate");
  const typingNext = document.getElementById("typingNext");

  function describeChar(char) {
    if (char === undefined) return "la fin du texte";
    if (char === " ") return "un espace";
    if (char === "-") return "un tiret simple -";
    return `« ${char} »`;
  }

  function firstDifference(actual, expected) {
    const a = Array.from(actual);
    const e = Array.from(expected);
    const length = Math.max(a.length, e.length);
    for (let index = 0; index < length; index += 1) {
      if (a[index] !== e[index]) return { index, actual: a[index], expected: e[index] };
    }
    return null;
  }

  function updateTypingLive() {
    const value = typingInput.value;
    const target = typingTasks[state.typingIndex] || "";
    typingCounter.textContent = `${Array.from(value).length} caractère${Array.from(value).length > 1 ? "s" : ""} / ${Array.from(target).length}`;
    let correctStart = 0;
    const a = Array.from(value);
    const e = Array.from(target);
    while (a[correctStart] === e[correctStart] && correctStart < a.length) correctStart += 1;
    if (!value) typingCompare.textContent = "Chaque signe compte.";
    else if (value === target) typingCompare.textContent = "Tout correspond !";
    else typingCompare.textContent = `${correctStart} caractère${correctStart > 1 ? "s" : ""} correct${correctStart > 1 ? "s" : ""} depuis le début`;
    typingInput.classList.toggle("input-good", value === target);
    typingInput.classList.remove("input-bad");
  }

  function loadTypingTask() {
    typingModel.textContent = typingTasks[state.typingIndex];
    typingRound.textContent = String(state.typingIndex + 1);
    typingInput.value = "";
    typingInput.disabled = false;
    typingValidate.disabled = false;
    updateTypingLive();
    typingInput.focus();
  }

  typingInput.addEventListener("input", updateTypingLive);
  protectManualEntry(typingInput, "typing", typingFeedback, "Le collage est bloqué dans ce défi : recopie le modèle avec le clavier.");
  typingInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      typingValidate.click();
    }
  });
  document.getElementById("typingClear").addEventListener("click", () => {
    typingInput.value = "";
    updateTypingLive();
    typingInput.focus();
  });
  typingValidate.addEventListener("click", () => {
    const target = typingTasks[state.typingIndex];
    if (typingInput.value === target) {
      addScore(`typing-${state.typingIndex}`, 300);
      typingInput.disabled = true;
      typingValidate.disabled = true;
      setFeedback(typingFeedback, `<strong>Parfait au caractère près !</strong> Le code ${state.typingIndex + 1} est validé.`, "success");
      state.typingIndex += 1;
      if (state.typingIndex >= typingTasks.length) {
        addScore("typing-complete", 100);
        typingNext.disabled = false;
        setFeedback(typingFeedback, "<strong>Défi validé !</strong> Tu as conservé les accents, les espaces, les majuscules et tous les signes.", "success");
      } else {
        window.setTimeout(loadTypingTask, 750);
      }
      return;
    }
    const difference = firstDifference(typingInput.value, target);
    applyPenalty("typing", 50);
    typingInput.classList.add("input-bad");
    const position = difference.index + 1;
    if (difference.actual === undefined) {
      setFeedback(typingFeedback, `Il manque ${describeChar(difference.expected)} à partir de la position ${position}. Regarde la fin du modèle.`, "error");
    } else if (difference.expected === undefined) {
      setFeedback(typingFeedback, `Il y a un caractère en trop à la position ${position} : ${describeChar(difference.actual)}.`, "error");
    } else {
      setFeedback(typingFeedback, `Première différence à la position ${position} : tu as écrit ${describeChar(difference.actual)}, mais le modèle attend ${describeChar(difference.expected)}.`, "error");
    }
  });
  typingNext.addEventListener("click", () => showScreen("challenge3"));

  // Défi 3 — correction
  const correctionTasks = [
    {
      initial: "Le clavier est prêt !x",
      target: "Le clavier est prêt !",
      label: "RETOUR ARRIÈRE",
      prompt: "Place le curseur après le x en trop, puis utilise <kbd>Retour arrière</kbd>.",
      required: "Backspace",
      requiredCount: 1
    },
    {
      initial: "Pixel active le mode xxrapide.",
      target: "Pixel active le mode rapide.",
      label: "SUPPR",
      prompt: "Place le curseur avant les deux x, puis appuie deux fois sur <kbd>Suppr</kbd>.",
      required: "Delete",
      requiredCount: 2
    },
    {
      initial: "Appuie sur Controôle puis sur S.",
      target: "Appuie sur Contrôle puis sur S.",
      label: "CHOISIS TA MÉTHODE",
      prompt: "Corrige la lettre en trop avec Retour arrière ou Suppr, selon la place de ton curseur.",
      required: null,
      requiredCount: 0
    }
  ];
  const correctionInput = document.getElementById("correctionInput");
  const correctionTarget = document.getElementById("correctionTarget");
  const correctionRound = document.getElementById("correctionRound");
  const correctionLabel = document.getElementById("correctionLabel");
  const correctionPrompt = document.getElementById("correctionPrompt");
  const correctionStep = document.getElementById("correctionStep");
  const correctionFeedback = document.getElementById("correctionFeedback");
  const correctionValidate = document.getElementById("correctionValidate");
  const correctionNext = document.getElementById("correctionNext");

  protectManualEntry(correctionInput, "correction", correctionFeedback, "Le collage est bloqué ici : utilise Retour arrière ou Suppr pour réparer le texte.");

  function loadCorrectionTask() {
    const task = correctionTasks[state.correctionIndex];
    correctionInput.value = task.initial;
    correctionInput.disabled = false;
    correctionTarget.textContent = task.target;
    correctionRound.textContent = `${state.correctionIndex + 1} / ${correctionTasks.length}`;
    correctionLabel.textContent = task.label;
    correctionPrompt.innerHTML = task.prompt;
    correctionStep.textContent = String(state.correctionIndex + 1);
    correctionValidate.disabled = false;
    state.correctionKeys[state.correctionIndex] = { Backspace: 0, Delete: 0 };
  }
  correctionInput.addEventListener("keydown", event => {
    if (event.key === "Backspace" || event.key === "Delete") {
      state.correctionKeys[state.correctionIndex][event.key] += 1;
    }
  });
  correctionValidate.addEventListener("click", () => {
    const task = correctionTasks[state.correctionIndex];
    if (correctionInput.value !== task.target) {
      const difference = firstDifference(correctionInput.value, task.target);
      applyPenalty("correction", 50);
      setFeedback(correctionFeedback, `Ce n’est pas encore exact. Vérifie autour de la position ${difference.index + 1} : attendu ${describeChar(difference.expected)}.`, "error");
      return;
    }
    if (task.required && state.correctionKeys[state.correctionIndex][task.required] < task.requiredCount) {
      const label = task.required === "Backspace" ? "Retour arrière" : "Suppr";
      applyPenalty("correction", 25);
      setFeedback(correctionFeedback, `Le texte est juste, mais cette manche sert à essayer <strong>${label}</strong>. Repars du texte proposé et utilise cette touche.`, "error");
      loadCorrectionTask();
      correctionInput.focus();
      return;
    }
    addScore(`correction-${state.correctionIndex}`, 300);
    correctionInput.disabled = true;
    correctionValidate.disabled = true;
    setFeedback(correctionFeedback, "<strong>Réparation réussie !</strong> Tu as choisi la bonne touche par rapport au curseur.", "success");
    state.correctionIndex += 1;
    if (state.correctionIndex >= correctionTasks.length) {
      addScore("correction-complete", 100);
      correctionNext.disabled = false;
      setFeedback(correctionFeedback, "<strong>Défi validé !</strong> Retour arrière efface à gauche ; Suppr efface à droite.", "success");
    } else {
      window.setTimeout(loadCorrectionTask, 750);
    }
  });
  correctionNext.addEventListener("click", () => showScreen("challenge4"));
  loadCorrectionTask();

  // Défi 4 — caractères spéciaux
  const symbolTasks = [
    { goal: "@", modifier: "altgr", base: "0", note: "Alt Gr + 0 produit @ sur un clavier AZERTY." },
    { goal: "€", modifier: "altgr", base: "e", note: "Alt Gr + E produit le symbole euro." },
    { goal: "?", modifier: "shift", base: ",", note: "Maj + la touche virgule produit le point d’interrogation." },
    { goal: ":", modifier: "none", base: ":", note: "Le deux-points est le premier signe de cette touche : aucun modificateur." },
    { goal: "/", modifier: "shift", base: ":", note: "Maj + la touche deux-points produit la barre oblique /." }
  ];
  const symbolGoal = document.getElementById("symbolGoal");
  const symbolDisplay = document.getElementById("symbolDisplay");
  const symbolStep = document.getElementById("symbolStep");
  const symbolActionPrompt = document.getElementById("symbolActionPrompt");
  const symbolHintText = document.getElementById("symbolHintText");
  const directSymbolNote = document.getElementById("directSymbolNote");
  const symbolFeedback = document.getElementById("symbolFeedback");
  const comboResult = document.getElementById("comboResult").querySelector("strong");
  const symbolNext = document.getElementById("symbolNext");
  const modifierLabels = { none: "Touche seule", shift: "Maj", altgr: "Alt Gr" };
  const baseLabels = { "0": "0 / à / @", e: "E / €", ",": ", / ?", ":": ": / /" };

  function loadSymbolTask() {
    const task = symbolTasks[state.symbolIndex];
    const isDirect = task.modifier === "none";
    state.selectedModifier = isDirect ? "none" : null;
    symbolGoal.textContent = task.goal;
    symbolDisplay.textContent = task.goal;
    symbolStep.textContent = String(state.symbolIndex + 1);
    symbolActionPrompt.innerHTML = isDirect
      ? `Pour écrire <strong class="symbol-goal">${task.goal}</strong>, ne maintiens aucune touche : clique directement sur la touche où le symbole est dessiné.`
      : `Pour écrire <strong class="symbol-goal">${task.goal}</strong>, sélectionne d’abord la touche à maintenir, puis la touche où le symbole est dessiné.`;
    symbolHintText.textContent = isDirect
      ? "Le symbole est le caractère principal : aucune touche à maintenir."
      : task.modifier === "altgr"
        ? "Le symbole est en bas à droite d’une touche."
        : "Le symbole est écrit en haut d’une touche.";
    directSymbolNote.classList.toggle("is-active", isDirect);
    comboResult.textContent = isDirect ? "Aucune touche à maintenir · choisis la partie B" : "Commence par la partie A";
    document.querySelectorAll("#modifierChoices button").forEach(button => {
      button.classList.remove("is-selected");
      button.disabled = isDirect;
    });
  }
  document.getElementById("modifierChoices").addEventListener("click", event => {
    const button = event.target.closest("[data-modifier]");
    if (!button || state.symbolIndex >= symbolTasks.length) return;
    state.selectedModifier = button.dataset.modifier;
    document.querySelectorAll("#modifierChoices button").forEach(item => item.classList.toggle("is-selected", item === button));
    comboResult.textContent = `${modifierLabels[state.selectedModifier]} + …`;
  });
  document.getElementById("symbolKeys").addEventListener("click", event => {
    const button = event.target.closest("[data-base]");
    if (!button || state.symbolIndex >= symbolTasks.length) return;
    if (state.selectedModifier === null) {
      applyPenalty("symbols", 20);
      setFeedback(symbolFeedback, "Commence par la <strong>partie A</strong> : clique sur <strong>Maj</strong> ou <strong>Alt Gr</strong>.", "error");
      return;
    }
    const task = symbolTasks[state.symbolIndex];
    const base = button.dataset.base;
    comboResult.textContent = state.selectedModifier === "none"
      ? `${baseLabels[base]} · touche seule`
      : `${modifierLabels[state.selectedModifier]} + ${baseLabels[base]}`;
    if (state.selectedModifier !== task.modifier || base !== task.base) {
      const modifierClue = task.modifier === "altgr" ? "Le symbole est écrit en troisième position sur une touche." : task.modifier === "shift" ? "Cherche le symbole écrit en haut de la touche." : "Le symbole est directement accessible.";
      applyPenalty("symbols", 30);
      setFeedback(symbolFeedback, `Cette combinaison ne produit pas ${task.goal}. ${modifierClue}`, "error");
      return;
    }
    addScore(`symbol-${state.symbolIndex}`, 180);
    comboResult.textContent += ` → ${task.goal}`;
    setFeedback(symbolFeedback, `<strong>Bonne combinaison !</strong> ${task.note}`, "success");
    state.symbolIndex += 1;
    if (state.symbolIndex >= symbolTasks.length) {
      addScore("symbols-complete", 100);
      symbolNext.disabled = false;
      symbolStep.textContent = "✓";
      setFeedback(symbolFeedback, "<strong>Atelier validé !</strong> Tu sais lire les différents signes inscrits sur une touche.", "success");
    } else {
      window.setTimeout(loadSymbolTask, 700);
    }
  });
  symbolNext.addEventListener("click", () => showScreen("challenge5"));
  loadSymbolTask();

  // Défi 5 — raccourcis
  const shortcutTasks = [
    { answer: "copy", prompt: "Pixel veut copier la phrase sélectionnée. Quelle commande utilise-t-il ?", line: "<mark>CODE LUMIÈRE</mark>", status: "La phrase est sélectionnée", success: "La sélection est copiée en mémoire." },
    { answer: "paste", prompt: "Pixel veut placer le code copié à la ligne suivante. Quelle commande utilise-t-il ?", line: "CODE LUMIÈRE<br><span class='cursor'>|</span>", status: "Le curseur est à la ligne suivante", success: "Le code est collé sans avoir été retapé." },
    { answer: "undo", prompt: "Pixel vient d’effacer le code par erreur. Quelle commande annule sa dernière action ?", line: "<del>CODE LUMIÈRE</del>", status: "Oups : le code vient d’être supprimé", success: "La dernière action est annulée : le code revient." },
    { answer: "save", prompt: "Le document est terminé. Quelle commande enregistre les modifications ?", line: "CODE LUMIÈRE<br><small>Mission terminée.</small>", status: "● Modifications non enregistrées", success: "Le fichier est enregistré." }
  ];
  const shortcutPrompt = document.getElementById("shortcutPrompt");
  const shortcutStep = document.getElementById("shortcutStep");
  const shortcutFeedback = document.getElementById("shortcutFeedback");
  const shortcutNext = document.getElementById("shortcutNext");
  const editorLine = document.getElementById("editorLine");
  const saveState = document.getElementById("saveState");

  function loadShortcutTask() {
    const task = shortcutTasks[state.shortcutIndex];
    shortcutPrompt.textContent = task.prompt;
    shortcutStep.textContent = String(state.shortcutIndex + 1);
    editorLine.innerHTML = task.line;
    saveState.textContent = task.status;
    saveState.classList.remove("saved");
    document.querySelectorAll("#shortcutPad button").forEach(button => button.classList.remove("is-correct", "is-wrong"));
  }

  function submitShortcut(answer) {
    if (state.screen !== "challenge5" || state.shortcutIndex >= shortcutTasks.length) return;
    const task = shortcutTasks[state.shortcutIndex];
    const button = document.querySelector(`#shortcutPad [data-shortcut="${answer}"]`);
    if (answer !== task.answer) {
      button?.classList.add("is-wrong");
      window.setTimeout(() => button?.classList.remove("is-wrong"), 450);
      const labels = { copy: "copier", paste: "coller", undo: "annuler", save: "enregistrer" };
      applyPenalty("shortcuts", 50);
      setFeedback(shortcutFeedback, `Cette commande sert à <strong>${labels[answer]}</strong>. Relis précisément ce que Pixel veut faire.`, "error");
      return;
    }
    button?.classList.add("is-correct");
    if (answer === "copy") saveState.textContent = "✓ Copié dans la mémoire";
    if (answer === "paste") editorLine.innerHTML = "CODE LUMIÈRE<br><mark>CODE LUMIÈRE</mark>";
    if (answer === "undo") editorLine.innerHTML = "<mark>CODE LUMIÈRE</mark>";
    if (answer === "save") { saveState.textContent = "✓ Toutes les modifications sont enregistrées"; saveState.classList.add("saved"); }
    addScore(`shortcut-${state.shortcutIndex}`, 225);
    setFeedback(shortcutFeedback, `<strong>Bonne commande !</strong> ${task.success}`, "success");
    state.shortcutIndex += 1;
    if (state.shortcutIndex >= shortcutTasks.length) {
      addScore("shortcuts-complete", 100);
      shortcutNext.disabled = false;
      shortcutStep.textContent = "✓";
      setFeedback(shortcutFeedback, "<strong>Poste de commande validé !</strong> C copie, V colle, Z annule et S sauvegarde.", "success");
    } else {
      window.setTimeout(loadShortcutTask, 750);
    }
  }
  document.getElementById("shortcutPad").addEventListener("click", event => {
    const button = event.target.closest("[data-shortcut]");
    if (button) submitShortcut(button.dataset.shortcut);
  });
  document.addEventListener("keydown", event => {
    if (state.screen !== "challenge5" || !event.ctrlKey) return;
    const map = { c: "copy", v: "paste", z: "undo", s: "save" };
    const answer = map[event.key.toLowerCase()];
    if (answer) {
      event.preventDefault();
      submitShortcut(answer);
    }
  });
  shortcutNext.addEventListener("click", () => showScreen("bonus"));
  loadShortcutTask();

  // Bonus chronométré
  const bonusTasks = ["Robot n°4 : prêt ?", "Zoé : 18,5 € / 20", "contact@labo.example"];
  const timerValue = document.getElementById("timerValue");
  const timerDial = document.getElementById("timerDial");
  const bonusRound = document.getElementById("bonusRound");
  const bonusScore = document.getElementById("bonusScore");
  const bonusModel = document.getElementById("bonusModel");
  const bonusInput = document.getElementById("bonusInput");
  const bonusValidate = document.getElementById("bonusValidate");
  const startTimer = document.getElementById("startTimer");
  const finishButton = document.getElementById("finishButton");
  const bonusFeedback = document.getElementById("bonusFeedback");

  protectManualEntry(bonusInput, "bonus", bonusFeedback, "Le collage est bloqué pendant le chrono : tape chaque code au clavier.");

  function updateBonusCount() {
    bonusScore.textContent = `${state.bonusCodes} code${state.bonusCodes > 1 ? "s" : ""} validé${state.bonusCodes > 1 ? "s" : ""}`;
  }
  function stopBonus(message, success = false) {
    window.clearInterval(state.timer);
    state.timer = null;
    state.bonusFinished = true;
    bonusInput.disabled = true;
    bonusValidate.hidden = true;
    finishButton.disabled = false;
    timerDial.classList.remove("is-running");
    setFeedback(bonusFeedback, message, success ? "success" : "info");
  }
  function tickBonus() {
    state.bonusSeconds -= 1;
    timerValue.textContent = String(state.bonusSeconds);
    timerDial.classList.toggle("is-low", state.bonusSeconds <= 10);
    if (state.bonusSeconds <= 0) {
      stopBonus(`Temps écoulé ! Tu as validé <strong>${state.bonusCodes} code${state.bonusCodes > 1 ? "s" : ""}</strong>. Ton score principal ne change pas.`);
    }
  }
  function startBonus() {
    if (state.bonusStarted || state.bonusFinished) return;
    state.bonusStarted = true;
    bonusInput.disabled = false;
    bonusInput.placeholder = "Écris ici…";
    startTimer.hidden = true;
    bonusValidate.hidden = false;
    timerDial.classList.add("is-running");
    state.timer = window.setInterval(tickBonus, 1000);
    bonusInput.focus();
    setFeedback(bonusFeedback, "Chrono lancé : reste précis, puis valide chaque code.");
  }
  function nextBonusTask() {
    state.bonusIndex += 1;
    if (state.bonusIndex >= bonusTasks.length) {
      stopBonus(`<strong>Bonus parfait !</strong> Les 3 codes sont exacts avec ${state.bonusSeconds} seconde${state.bonusSeconds > 1 ? "s" : ""} restante${state.bonusSeconds > 1 ? "s" : ""}.`, true);
      return;
    }
    bonusModel.textContent = bonusTasks[state.bonusIndex];
    bonusRound.textContent = String(state.bonusIndex + 1);
    bonusInput.value = "";
    bonusInput.focus();
  }
  function resetBonus() {
    window.clearInterval(state.timer);
    state.timer = null;
    state.bonusIndex = 0;
    state.bonusSeconds = 60;
    state.bonusStarted = false;
    state.bonusFinished = false;
    state.bonusCodes = 0;
    timerValue.textContent = "60";
    timerDial.classList.remove("is-running", "is-low");
    bonusModel.textContent = bonusTasks[0];
    bonusRound.textContent = "1";
    bonusInput.value = "";
    bonusInput.disabled = true;
    bonusInput.placeholder = "Le chrono n’a pas commencé…";
    startTimer.hidden = false;
    bonusValidate.hidden = true;
    finishButton.disabled = true;
    updateBonusCount();
    setFeedback(bonusFeedback, "Le bonus peut seulement ajouter des points. Il ne peut pas faire baisser ton score.");
  }
  startTimer.addEventListener("click", startBonus);
  bonusInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      bonusValidate.click();
    }
  });
  bonusValidate.addEventListener("click", () => {
    const target = bonusTasks[state.bonusIndex];
    if (bonusInput.value !== target) {
      const difference = firstDifference(bonusInput.value, target);
      applyPenalty("bonus", 25);
      setFeedback(bonusFeedback, `Pas encore exact : vérifie la position ${difference.index + 1}. Attendu ${describeChar(difference.expected)}.`, "error");
      return;
    }
    addScore(`bonus-${state.bonusIndex}`, 200);
    state.bonusCodes += 1;
    updateBonusCount();
    setFeedback(bonusFeedback, `<strong>Code ${state.bonusIndex + 1} validé !</strong> Continue sans perdre ta précision.`, "success");
    nextBonusTask();
  });
  document.getElementById("skipBonus").addEventListener("click", () => {
    stopBonus("Bonus passé. Aucun point n’est retiré : tu peux ouvrir ton bilan.");
  });

  // Bilan final
  function renderFinal() {
    renderRunningScore();
    const coreCategories = ["keys", "typing", "correction", "symbols", "shortcuts"];
    const coreScore = coreCategories.reduce((total, category) => total + categoryScore(category), 0);
    const corePercent = Math.round((coreScore / 5000) * 100);
    const bonusScoreFinal = categoryScore("bonus");
    const totalMistakes = Object.values(state.mistakes).reduce((total, mistakes) => total + mistakes, 0);
    const bonusComplete = state.bonusCodes === bonusTasks.length;
    const starCount = corePercent >= 90 ? 3 : corePercent >= 70 ? 2 : 1;
    const stars = `${"★ ".repeat(starCount)}${"☆ ".repeat(3 - starCount)}`.trim();
    const levelFor = percent => percent >= 85
      ? { label: "Maîtrisé", className: "mastered", icon: "✓" }
      : percent >= 65
        ? { label: "À consolider", className: "consolidate", icon: "↗" }
        : { label: "À retravailler", className: "retry", icon: "↻" };

    document.getElementById("starRow").textContent = stars;
    document.getElementById("starRow").setAttribute("aria-label", `${starCount} étoile${starCount > 1 ? "s" : ""} sur 3`);
    document.getElementById("finalScore").textContent = String(state.score);
    document.getElementById("finalPercent").textContent = `${corePercent} %`;
    document.getElementById("errorSummary").textContent = `${totalMistakes} erreur${totalMistakes > 1 ? "s" : ""} relevée${totalMistakes > 1 ? "s" : ""}`;
    document.getElementById("rankBadge").textContent = corePercent >= 95 ? "Expert précis" : corePercent >= 85 ? "Clavier autonome" : corePercent >= 70 ? "En bonne voie" : "En entraînement";
    document.getElementById("finalMessage").textContent = totalMistakes === 0
      ? "Parcours sans erreur : ta précision est excellente."
      : corePercent >= 85
        ? "Très bon parcours : regarde le détail pour savoir où gagner encore en précision."
        : "Mission terminée : le détail ci-dessous te montre exactement quoi retravailler.";

    const reports = [
      { category: "keys", title: "Défi 1 · Repérage", skill: "Je repère les touches et distingue Maj de Verr. Maj", badge: "⌨ Repéreur de touches" },
      { category: "typing", title: "Défi 2 · Saisie exacte", skill: "Je recopie une chaîne au caractère près", badge: "✓ Saisie au caractère près" },
      { category: "correction", title: "Défi 3 · Correction", skill: "Je corrige avec Retour arrière et Suppr", badge: "⌫ Correcteur méthodique" },
      { category: "symbols", title: "Défi 4 · Symboles", skill: "Je produis @, €, ?, : et /", badge: "@ Artisan des symboles" },
      { category: "shortcuts", title: "Défi 5 · Raccourcis", skill: "J’utilise Ctrl+C, Ctrl+V, Ctrl+Z et Ctrl+S", badge: "⚡ Ninja des raccourcis" }
    ];

    document.getElementById("skillsList").innerHTML = reports.map(report => {
      const percent = Math.round((categoryScore(report.category) / categoryMax[report.category]) * 100);
      const level = levelFor(percent);
      return `<li class="${level.className}"><span>${level.icon}</span><div><strong>${report.skill}</strong><small>${level.label} · ${percent} %</small></div></li>`;
    }).join("");

    const badges = reports.filter(report => categoryScore(report.category) >= 850).map(report => report.badge);
    if (bonusComplete && bonusScoreFinal >= 480) badges.push("⏱ As du chrono");
    document.getElementById("badgeShelf").innerHTML = `<h2>Badges obtenus</h2><div class="badge-list">${badges.length ? badges.map(badge => `<span class="badge">${badge}</span>`).join("") : '<p class="no-badge">Encore un peu d’entraînement pour décrocher ton premier badge.</p>'}</div>`;

    const reportRows = reports.map(report => {
      const score = categoryScore(report.category);
      const percent = Math.round((score / categoryMax[report.category]) * 100);
      const level = levelFor(percent);
      const mistakes = state.mistakes[report.category];
      return `<article class="result-row ${level.className}">
        <div class="result-row__head"><strong>${report.title}</strong><span>${score} / ${categoryMax[report.category]} pts</span></div>
        <div class="result-meter" role="progressbar" aria-label="${report.title}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>
        <div class="result-row__meta"><span>${percent} %</span><span>${mistakes} erreur${mistakes > 1 ? "s" : ""}</span><strong>${level.label}</strong></div>
      </article>`;
    }).join("");

    document.getElementById("resultDetails").innerHTML = `
      <div class="details-heading"><div><p class="eyebrow">BILAN PAR DÉFI</p><h2>Ce que je maîtrise, ce que je retravaille</h2></div><div class="core-score"><strong>${coreScore}</strong><span>/ 5000 pts essentiels</span></div></div>
      <div class="result-breakdown">${reportRows}</div>
      <div class="bonus-summary"><span>⏱ Bonus chrono</span><strong>${bonusScoreFinal} / 600 pts</strong><small>${state.mistakes.bonus} erreur${state.mistakes.bonus > 1 ? "s" : ""} · ${state.bonusCodes} code${state.bonusCodes > 1 ? "s" : ""} exact${state.bonusCodes > 1 ? "s" : ""}</small></div>
      <p class="scoring-note"><strong>Comment le score fonctionne :</strong> une erreur retire 20 à 50 points selon l’exercice. Le malus est limité à 500 points par défi. Ouvrir une aide ne retire jamais de point.</p>`;
  }
  finishButton.addEventListener("click", () => {
    renderFinal();
    showScreen("final");
  });
  document.getElementById("restartButton").addEventListener("click", () => window.location.reload());
  document.getElementById("printButton").addEventListener("click", () => window.print());

  // Aides contextuelles
  const helpContent = {
    keys: {
      title: "Repérer les touches importantes",
      html: `<div class="help-card amber-help"><strong>Regarde les bords du clavier.</strong> Les grandes touches de commande sont souvent placées à gauche, à droite ou tout en bas.</div>
        <ul><li><kbd>Entrée</kbd> valide ou va à la ligne.</li><li><kbd>Maj</kbd> est maintenue pour une seule majuscule.</li><li><kbd>Verr. Maj</kbd> reste active : un voyant peut s’allumer.</li><li><kbd>⌫</kbd> efface à gauche ; <kbd>Suppr</kbd> efface à droite.</li><li><kbd>Ctrl</kbd> et <kbd>Alt Gr</kbd> se combinent avec d’autres touches.</li></ul>`
    },
    typing: {
      title: "Recopier sans perdre un signe",
      html: `<div class="help-card amber-help"><strong>Pour écrire É avec Alt + 144 :</strong><ol><li>Vérifie que <kbd>Verr. Num</kbd> est activé.</li><li>Garde la touche <kbd>Alt</kbd> enfoncée.</li><li>Sur le <strong>pavé numérique</strong>, tape <kbd>1</kbd> <kbd>4</kbd> <kbd>4</kbd>.</li><li>Relâche <kbd>Alt</kbd> : le caractère <strong>É</strong> apparaît.</li></ol><small>Les chiffres situés en haut du clavier ne fonctionnent pas pour ce raccourci.</small></div>
        <ol><li>Lis le modèle une première fois sans écrire.</li><li>Recopie par petits groupes de 3 à 5 caractères.</li><li>Compare de gauche à droite.</li><li>Vérifie les espaces avant et après <strong>:</strong>, <strong>€</strong>, <strong>-</strong> et <strong>/</strong>.</li></ol>
        <div class="help-card"><strong>Les signes du premier code :</strong><div class="key-demo"><kbd>Maj</kbd> + <kbd>)</kbd><span>→ °</span></div><div class="key-demo"><kbd>Alt Gr</kbd> + <kbd>0</kbd><span>→ @</span></div><div class="key-demo"><kbd>Alt Gr</kbd> + <kbd>E</kbd><span>→ €</span></div><div class="key-demo"><kbd>Maj</kbd> + <kbd>,</kbd><span>→ ?</span></div><div class="key-demo"><kbd>Maj</kbd> + <kbd>:</kbd><span>→ /</span></div></div>
        <div class="help-card"><strong>Pour le tiret - :</strong> utilise la touche du tiret simple ou la touche <kbd>-</kbd> du pavé numérique. Les deux sont acceptées.</div>
        <div class="help-card purple-help">Dans le deuxième code, le signe <strong>"</strong> s’obtient avec la touche <kbd>3 / "</kbd> sans Maj. La phrase commence par un A sans accent.</div>
        <div class="help-card">Le message d’erreur donne la position de la première différence. Compte calmement jusqu’à cet endroit.</div>`
    },
    correction: {
      title: "Choisir Retour arrière ou Suppr",
      html: `<div class="key-demo"><kbd>texteX|</kbd><span>+</span><kbd>⌫</kbd><span>→ efface X à gauche</span></div><div class="key-demo"><kbd>texte|X</kbd><span>+</span><kbd>Suppr</kbd><span>→ efface X à droite</span></div><div class="help-card purple-help"><strong>Le trait | représente le curseur.</strong> Clique d’abord exactement à l’endroit où tu veux corriger.</div>`
    },
    symbols: {
      title: "Lire les signes dessinés sur une touche",
      html: `<div class="help-card amber-help"><strong>Dans l’activité :</strong> choisis d’abord <kbd>Maj</kbd> ou <kbd>Alt Gr</kbd> dans la partie A, puis clique sur la touche dessinée dans la partie B. Pour le signe <strong>:</strong>, la partie A se désactive : clique directement sur sa touche.</div><ul><li>Le signe principal, écrit en bas à gauche, s’écrit avec la touche seule.</li><li>Le signe écrit en haut s’obtient en maintenant <kbd>Maj</kbd>.</li><li>Le signe écrit en bas à droite s’obtient en maintenant <kbd>Alt Gr</kbd>.</li></ul><div class="key-demo"><kbd>Alt Gr</kbd><span>+</span><kbd>0 / à / @</kbd><span>→ @</span></div><div class="key-demo"><kbd>Alt Gr</kbd><span>+</span><kbd>E / €</kbd><span>→ €</span></div><div class="key-demo"><kbd>Maj</kbd><span>+</span><kbd>, / ?</kbd><span>→ ?</span></div><div class="key-demo"><kbd>:</kbd><span>seule</span><span>→ :</span></div><div class="key-demo"><kbd>Maj</kbd><span>+</span><kbd>: / /</kbd><span>→ /</span></div>`
    },
    shortcuts: {
      title: "Les quatre raccourcis essentiels",
      html: `<div class="key-demo"><kbd>Ctrl</kbd> + <kbd>C</kbd><span>Copier</span></div><div class="key-demo"><kbd>Ctrl</kbd> + <kbd>V</kbd><span>Coller</span></div><div class="key-demo"><kbd>Ctrl</kbd> + <kbd>Z</kbd><span>Annuler la dernière action</span></div><div class="key-demo"><kbd>Ctrl</kbd> + <kbd>S</kbd><span>Sauvegarder</span></div><div class="help-card">Garde <kbd>Ctrl</kbd> enfoncée, appuie une fois sur la lettre, puis relâche les deux touches.</div>`
    },
    chrono: {
      title: "Rester précis avec le chrono",
      html: `<ul><li>Lis le code entier avant de lancer.</li><li>Écris par petits groupes.</li><li>Valide avec le bouton ou la touche Entrée.</li><li>Si tu te trompes, corrige seulement la zone indiquée.</li></ul><div class="help-card amber-help"><strong>Important :</strong> le copier-coller et le glisser-déposer sont bloqués. Une tentative retire 25 points du bonus, mais ne touche jamais au score principal.</div>`
    },
    welcome: {
      title: "Comment fonctionne la mission ?",
      html: `<p>Termine les cinq défis dans l’ordre. Chaque bonne action donne des points et débloque la suite.</p><div class="help-card"><strong>Tu peux ouvrir cette aide à tout moment.</strong> Utiliser un tutoriel est une bonne stratégie et ne retire aucun point.</div>`
    }
  };
  const helpDialog = document.getElementById("helpDialog");
  const helpTitle = document.getElementById("helpTitle");
  const helpBody = document.getElementById("helpContent");
  let lastHelpTrigger = null;

  function openHelp(key) {
    const help = helpContent[key] || helpContent.welcome;
    helpTitle.textContent = help.title;
    helpBody.innerHTML = help.html;
    helpDialog.showModal();
  }
  document.querySelectorAll("[data-help]").forEach(button => button.addEventListener("click", () => {
    lastHelpTrigger = button;
    openHelp(button.dataset.help);
  }));
  document.getElementById("helpButton").addEventListener("click", event => {
    lastHelpTrigger = event.currentTarget;
    const map = { challenge1: "keys", challenge2: "typing", challenge3: "correction", challenge4: "symbols", challenge5: "shortcuts", bonus: "chrono" };
    openHelp(map[state.screen] || "welcome");
  });
  function closeHelp() {
    helpDialog.close();
    lastHelpTrigger?.focus();
  }
  document.getElementById("closeHelp").addEventListener("click", closeHelp);
  document.getElementById("gotItButton").addEventListener("click", closeHelp);
  helpDialog.addEventListener("click", event => {
    if (event.target === helpDialog) closeHelp();
  });

  // Préparation initiale
  loadTypingTask();
  resetBonus();
  showToast("Mission prête : aucune donnée n’est envoyée sur Internet.");
})();
