(() => {
  "use strict";

  const screens = [...document.querySelectorAll(".screen")];
  const missionBar = document.getElementById("missionBar");
  const progressFill = document.getElementById("progressFill");
  const progressBar = document.querySelector("[role='progressbar']");
  const stepLabel = document.getElementById("stepLabel");
  const scoreValue = document.getElementById("scoreValue");
  const toast = document.getElementById("toast");
  const screenOrder = ["welcome", "challenge1", "challenge2", "challenge3", "bonus", "final"];
  const MAX_SCORE = 4000;
  const ERROR_PENALTY = 25;

  const state = {
    current: "welcome",
    score: 0,
    errors: 0,
    penalties: { zones: 0, windows: 0, mouse: 0, keyboard: 0 },
    mistakes: {},
    awarded: new Set(),
    attempts: { zones: 0, windows: 0, mouse: 0, keyboard: 0 },
    zoneIndex: 0,
    windowIndex: 0,
    mouseIndex: 0,
    keyboardIndex: 0,
    zoneQuizStarted: false,
    zoneQuizComplete: false,
    windowQuizStarted: false,
    windowQuizComplete: false,
    mouseQuizStarted: false,
    mouseQuizComplete: false,
    typingStarted: false,
    typingIndex: 0,
    typingReadyNext: false,
    bonusComplete: false
  };

  const challengeProgress = { welcome: 0, challenge1: 8, challenge2: 33, challenge3: 58, bonus: 82, final: 100 };
  const helpCopy = {
    general: `<p>Dans chaque défi, lis d’abord la consigne placée au-dessus de l’écran.</p><ul><li>Essaie une action à la fois.</li><li>Une erreur retire ${ERROR_PENALTY} points, mais tu peux toujours corriger et continuer.</li><li>Le message sous l’activité te dit tout de suite si tu avances.</li><li>Le bouton « Coup de pouce » donne un indice sans retirer de point.</li></ul>`,
    zones: `<ul><li><strong>Bureau :</strong> la grande surface de fond.</li><li><strong>Icône :</strong> un petit dessin qui représente un fichier, un dossier ou une application.</li><li><strong>Fenêtre :</strong> un cadre qui affiche un logiciel ou un dossier.</li><li><strong>Barre des tâches :</strong> la bande tout en bas de l’écran.</li><li><strong>Démarrer :</strong> le bouton ⊞, à gauche de la barre.</li><li><strong>Notifications :</strong> l’heure et les petits symboles, à droite.</li></ul>`,
    windows: `<ul><li><strong>Double-clic :</strong> deux clics rapides pour ouvrir.</li><li><strong>—</strong> réduit la fenêtre sans la fermer.</li><li><strong>□</strong> agrandit la fenêtre.</li><li><strong>×</strong> ferme la fenêtre.</li><li>Un bouton de la barre des tâches permet de retrouver une fenêtre réduite ou de changer d’application.</li></ul>`,
    mouse: `<ul><li><strong>Clic :</strong> sélectionner ou actionner un bouton.</li><li><strong>Double-clic :</strong> ouvrir un fichier ou un dossier.</li><li><strong>Clic droit :</strong> afficher les actions possibles.</li><li><strong>Glisser-déposer :</strong> maintenir le clic, déplacer, puis relâcher.</li></ul>`,
    keyboard: `<p>Garde la touche <kbd>Ctrl</kbd> enfoncée et appuie une fois sur la lettre.</p><ul><li><kbd>Ctrl</kbd> + <kbd>A</kbd> : tout sélectionner.</li><li><kbd>Ctrl</kbd> + <kbd>C</kbd> : copier la sélection.</li><li><kbd>Ctrl</kbd> + <kbd>V</kbd> : coller ce qui a été copié.</li></ul>`
  };

  function showScreen(id) {
    screens.forEach(screen => screen.classList.toggle("is-active", screen.id === id));
    state.current = id;
    missionBar.hidden = id === "welcome" || id === "final";
    const step = Math.max(1, screenOrder.indexOf(id));
    stepLabel.textContent = id === "bonus" ? "Défi bonus" : `Défi ${step} sur 4`;
    const percent = challengeProgress[id];
    progressFill.style.width = `${percent}%`;
    progressBar.setAttribute("aria-valuenow", String(percent));
    window.scrollTo({ top: 0, behavior: "smooth" });
    const heading = document.querySelector(`#${id} h1`);
    if (heading && id !== "welcome") heading.focus({ preventScroll: true });
  }

  function addPoints(key, points) {
    if (state.awarded.has(key)) return;
    state.awarded.add(key);
    state.score += points;
    scoreValue.textContent = getScore();
    toast.textContent = `+ ${points} points · Bien joué !`;
    toast.classList.remove("penalty");
    toast.classList.add("show");
    clearTimeout(addPoints.timer);
    addPoints.timer = setTimeout(() => toast.classList.remove("show"), 1700);
  }

  function getScore() {
    const penalties = Object.values(state.penalties).reduce((sum, value) => sum + value, 0);
    return Math.max(0, state.score - penalties);
  }

  function recordMistake(skill, key) {
    state.errors++;
    state.penalties[skill] += ERROR_PENALTY;
    state.mistakes[key] = (state.mistakes[key] || 0) + 1;
    scoreValue.textContent = getScore();
    toast.textContent = `− ${ERROR_PENALTY} points · Observe et réessaie`;
    toast.classList.add("show", "penalty");
    clearTimeout(addPoints.timer);
    addPoints.timer = setTimeout(() => toast.classList.remove("show", "penalty"), 1700);
  }

  function setFeedback(element, message, type = "") {
    element.textContent = message;
    element.className = `feedback ${type}`.trim();
  }

  function createQuiz({ arena, count, context, question, answers, feedback, items, keyPrefix, skill, noun, endLabel, onComplete }) {
    let index = 0;

    function render() {
      const item = items[index];
      count.textContent = `${noun} ${index + 1} / ${items.length}`;
      context.textContent = item.context;
      question.textContent = item.question;
      answers.innerHTML = "";
      arena.querySelector(".quiz-next")?.remove();
      item.answers.forEach((answer, answerIndex) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "answer-button";
        button.textContent = answer;
        button.addEventListener("click", () => {
          if (answerIndex !== item.correct) {
            button.classList.add("wrong");
            recordMistake(skill, `${keyPrefix}-${index}`);
            setFeedback(feedback, `Pas encore. ${item.hint}`, "error");
            return;
          }
          [...answers.children].forEach(choice => choice.disabled = true);
          button.classList.add("correct");
          addPoints(`${keyPrefix}-${index}`, 100);
          setFeedback(feedback, item.explanation, "success");
          const next = document.createElement("button");
          next.type = "button";
          next.className = "primary-button quiz-next";
          next.textContent = index === items.length - 1 ? endLabel : `${noun} suivante →`;
          next.addEventListener("click", () => {
            index++;
            if (index >= items.length) onComplete();
            else render();
          });
          arena.appendChild(next);
        });
        answers.appendChild(button);
      });
    }
    return render;
  }

  document.getElementById("startButton").addEventListener("click", () => showScreen("challenge1"));
  document.getElementById("homeButton").addEventListener("click", () => showScreen("welcome"));
  document.querySelectorAll("[data-action='home']").forEach(button => button.addEventListener("click", () => showScreen("welcome")));
  document.querySelectorAll("[data-action='previous']").forEach(button => button.addEventListener("click", () => {
    const currentIndex = screenOrder.indexOf(state.current);
    showScreen(screenOrder[Math.max(1, currentIndex - 1)]);
  }));

  const helpDialog = document.getElementById("helpDialog");
  const helpContent = document.getElementById("helpContent");
  const openHelp = key => {
    helpContent.innerHTML = helpCopy[key] || helpCopy.general;
    helpDialog.showModal();
  };
  document.getElementById("helpButton").addEventListener("click", () => openHelp(state.current === "welcome" ? "general" : ({ challenge1: "zones", challenge2: "windows", challenge3: "mouse", bonus: "keyboard" }[state.current] || "general")));
  document.querySelectorAll("[data-help]").forEach(button => button.addEventListener("click", () => openHelp(button.dataset.help)));
  document.getElementById("closeHelp").addEventListener("click", () => helpDialog.close());
  document.getElementById("gotItButton").addEventListener("click", () => helpDialog.close());
  helpDialog.addEventListener("click", event => { if (event.target === helpDialog) helpDialog.close(); });

  // Défi 1 — repérer les zones.
  const zoneTasks = [
    { zone: "desktop", label: "Bureau", prompt: "Clique sur le <strong>Bureau</strong> : la grande zone de travail derrière les fenêtres." },
    { zone: "icon", label: "icône", prompt: "Trouve une <strong>icône</strong> : le petit dessin qui représente ici un dossier." },
    { zone: "window", label: "fenêtre", prompt: "Clique sur la <strong>fenêtre</strong> ouverte au milieu de l’écran." },
    { zone: "taskbar", label: "barre des tâches", prompt: "Repère la <strong>barre des tâches</strong>, tout en bas de l’écran." },
    { zone: "start", label: "bouton Démarrer", prompt: "Clique sur le <strong>bouton Démarrer ⊞</strong>, à gauche de la barre des tâches." },
    { zone: "notifications", label: "zone de notification", prompt: "Dernier repère : trouve la <strong>zone de notification</strong> avec l’heure, à droite." }
  ];
  const zonePrompt = document.getElementById("zonePrompt");
  const zoneStep = document.getElementById("zoneStep");
  const zoneFeedback = document.getElementById("zoneFeedback");
  const zoneNext = document.getElementById("zoneNext");

  function handleZone(zone) {
    if (state.zoneIndex >= zoneTasks.length) return;
    const task = zoneTasks[state.zoneIndex];
    state.attempts.zones++;
    if (zone !== task.zone) {
      recordMistake("zones", `zone-${task.zone}`);
      setFeedback(zoneFeedback, "Pas tout à fait. Relis la consigne et observe la position indiquée.", "error");
      return;
    }
    addPoints(`zone-${task.zone}`, 100);
    state.zoneIndex++;
    setFeedback(zoneFeedback, `Exact ! Tu as reconnu ${task.label}.`, "success");
    if (state.zoneIndex === zoneTasks.length) {
      zoneStep.textContent = "✓";
      zonePrompt.innerHTML = "Tous les repères sont identifiés. <strong>La manche 2 t’attend !</strong>";
      zoneNext.disabled = false;
      zoneNext.textContent = "Manche 2 →";
    } else {
      zoneStep.textContent = String(state.zoneIndex + 1);
      zonePrompt.innerHTML = zoneTasks[state.zoneIndex].prompt;
    }
  }

  document.querySelectorAll("#zoneDesktop [data-zone]").forEach(target => {
    target.addEventListener("click", event => { event.stopPropagation(); handleZone(target.dataset.zone); });
    target.addEventListener("keydown", event => { if ((event.key === "Enter" || event.key === " ") && target.tagName !== "BUTTON") { event.preventDefault(); handleZone(target.dataset.zone); } });
  });
  const zoneQuizItems = [
    { context: "Pixel veut lancer son dossier de mission.", question: "Sur quel élément doit-il agir ?", answers: ["Une icône", "Le fond du bureau", "L’heure", "La barre de titre"], correct: 0, hint: "Cherche le petit dessin qui représente un dossier.", explanation: "Exact : une icône représente un fichier, un dossier ou une application." },
    { context: "Une application est ouverte mais prend trop de place.", question: "Où apparaîtra-t-elle si on la réduit ?", answers: ["Dans la corbeille", "Dans la barre des tâches", "Dans le bouton Démarrer", "Elle disparaît pour toujours"], correct: 1, hint: "Réduire ne veut pas dire fermer.", explanation: "Oui : une fenêtre réduite reste accessible dans la barre des tâches." },
    { context: "Le professeur demande de vérifier le volume et l’heure.", question: "Quelle zone faut-il observer ?", answers: ["Les icônes", "Le bureau", "La zone de notification", "La fenêtre active"], correct: 2, hint: "Cette zone est placée à droite de la barre des tâches.", explanation: "Bien vu : l’heure, le son et le réseau se trouvent dans la zone de notification." },
    { context: "Plusieurs applications sont ouvertes.", question: "Comment reconnaître celle que l’on utilise maintenant ?", answers: ["Elle est toujours à gauche", "Sa fenêtre est au premier plan", "Elle est la plus ancienne", "Son icône disparaît"], correct: 1, hint: "Observe ce qui recouvre les autres fenêtres.", explanation: "Exact : la fenêtre active se trouve au premier plan." }
  ];
  const startZoneQuiz = createQuiz({
    arena: document.getElementById("zoneQuiz"), count: document.getElementById("zoneQuizCount"),
    context: document.getElementById("zoneQuizContext"), question: document.getElementById("zoneQuizQuestion"), answers: document.getElementById("zoneQuizAnswers"),
    feedback: zoneFeedback, items: zoneQuizItems, keyPrefix: "zone-quiz", skill: "zones", noun: "Question",
    endLabel: "Passer au défi Fenêtres →",
    onComplete: () => {
      state.zoneQuizComplete = true;
      zoneStep.textContent = "✓";
      zonePrompt.innerHTML = "Tu sais reconnaître les zones <strong>et expliquer leur rôle.</strong>";
      setFeedback(zoneFeedback, "Défi 1 terminé : repérage validé !", "success");
      showScreen("challenge2");
    }
  });
  zoneNext.addEventListener("click", () => {
    if (!state.zoneQuizStarted) {
      state.zoneQuizStarted = true;
      document.getElementById("zoneDesktop").hidden = true;
      document.getElementById("zoneQuiz").hidden = false;
      document.getElementById("zonePhaseLabel").textContent = "MANCHE 2 · COMPRENDS";
      zoneStep.textContent = "?";
      zonePrompt.innerHTML = "Lis chaque situation et choisis <strong>la réponse la plus précise.</strong>";
      zoneNext.hidden = true;
      setFeedback(zoneFeedback, "Tu peux recommencer tant que la réponse n’est pas juste.");
      startZoneQuiz();
    } else if (state.zoneQuizComplete) showScreen("challenge2");
  });

  // Défi 2 — manipuler les fenêtres.
  const windowTasks = [
    "Fais un <strong>double-clic</strong> sur le dossier « Enquête » pour l’ouvrir.",
    "Clique sur <strong>□</strong> pour agrandir la fenêtre.",
    "Clique sur <strong>—</strong> pour réduire la fenêtre dans la barre des tâches.",
    "Retrouve la fenêtre : clique sur <strong>📁 Enquête</strong> dans la barre des tâches.",
    "Passe à une autre fenêtre : clique sur <strong>📝 Notes</strong> dans la barre des tâches.",
    "Clique sur <strong>×</strong> pour fermer la fenêtre Notes."
  ];
  const folderWindow = document.getElementById("folderWindow");
  const notesWindow = document.getElementById("notesWindow");
  const folderTask = document.getElementById("folderTask");
  const notesTask = document.getElementById("notesTask");
  const windowPrompt = document.getElementById("windowPrompt");
  const windowStep = document.getElementById("windowStep");
  const windowFeedback = document.getElementById("windowFeedback");
  const windowNext = document.getElementById("windowNext");

  function advanceWindow(expected, success) {
    if (windowTasks[state.windowIndex] === undefined || expected !== state.windowIndex) return false;
    state.attempts.windows++;
    addPoints(`window-${state.windowIndex}`, 100);
    state.windowIndex++;
    setFeedback(windowFeedback, success, "success");
    if (state.windowIndex === windowTasks.length) {
      windowStep.textContent = "✓";
      windowPrompt.innerHTML = "Tu sais manipuler une fenêtre. <strong>À toi de résoudre les incidents !</strong>";
      windowNext.disabled = false;
      windowNext.textContent = "Manche 2 →";
    } else {
      windowStep.textContent = String(state.windowIndex + 1);
      windowPrompt.innerHTML = windowTasks[state.windowIndex];
    }
    return true;
  }

  let folderClickTimer;
  document.getElementById("folderLauncher").addEventListener("dblclick", () => {
    clearTimeout(folderClickTimer);
    if (advanceWindow(0, "Dossier ouvert ! Un double-clic lance l’ouverture.")) {
      folderWindow.hidden = false; folderWindow.classList.add("is-front"); folderTask.classList.add("is-active");
    }
  });
  document.getElementById("folderLauncher").addEventListener("click", () => {
    if (state.windowIndex !== 0) return;
    clearTimeout(folderClickTimer);
    folderClickTimer = setTimeout(() => {
      if (state.windowIndex !== 0) return;
      recordMistake("windows", "window-0");
      setFeedback(windowFeedback, "C’était un clic simple. Essaie deux clics rapides, sans bouger la souris.", "error");
    }, 280);
  });
  folderWindow.querySelector("[data-window-action='maximize']").addEventListener("click", () => {
    if (advanceWindow(1, "Fenêtre agrandie ! Elle utilise presque tout l’écran.")) folderWindow.classList.add("is-maximized");
    else if (state.windowIndex < windowTasks.length) { recordMistake("windows", `window-${state.windowIndex}`); setFeedback(windowFeedback, "Ce n’est pas encore la commande demandée. Relis la consigne.", "error"); }
  });
  folderWindow.querySelector("[data-window-action='minimize']").addEventListener("click", () => {
    if (advanceWindow(2, "Fenêtre réduite ! Elle reste ouverte dans la barre des tâches.")) { folderWindow.hidden = true; folderTask.classList.remove("is-active"); }
    else if (state.windowIndex < windowTasks.length) { recordMistake("windows", `window-${state.windowIndex}`); setFeedback(windowFeedback, "Cette commande ne correspond pas à l’étape actuelle.", "error"); }
  });
  folderTask.addEventListener("click", () => {
    if (advanceWindow(3, "Fenêtre retrouvée ! La barre des tâches sert aussi à cela.")) { folderWindow.hidden = false; folderWindow.classList.add("is-front"); folderTask.classList.add("is-active"); }
    else if (state.windowIndex > 3) { folderWindow.hidden = false; notesWindow.classList.remove("is-front"); folderWindow.classList.add("is-front"); folderTask.classList.add("is-active"); notesTask.classList.remove("is-active"); }
    else if (state.windowIndex < windowTasks.length) { recordMistake("windows", `window-${state.windowIndex}`); setFeedback(windowFeedback, "Ce bouton ne réalise pas encore l’action demandée.", "error"); }
  });
  notesTask.addEventListener("click", () => {
    if (state.windowIndex === 4) {
      notesWindow.hidden = false; folderWindow.classList.remove("is-front"); notesWindow.classList.add("is-front"); folderTask.classList.remove("is-active"); notesTask.classList.add("is-active");
      advanceWindow(4, "Changement réussi ! La fenêtre active passe devant les autres.");
    } else if (state.windowIndex < windowTasks.length) { recordMistake("windows", `window-${state.windowIndex}`); setFeedback(windowFeedback, "Pas encore : suis l’ordre indiqué au-dessus du bureau.", "error"); }
  });
  document.querySelector("[data-note-close]").addEventListener("click", () => {
    if (advanceWindow(5, "Fenêtre fermée ! Le bouton × termine l’application.")) { notesWindow.hidden = true; notesTask.classList.remove("is-active"); folderWindow.classList.add("is-front"); folderTask.classList.add("is-active"); }
  });
  folderWindow.querySelector("[data-window-action='close']").addEventListener("click", () => {
    if (state.windowIndex < 6) { recordMistake("windows", `window-${state.windowIndex}`); setFeedback(windowFeedback, "Attention : ce bouton fermerait le dossier. Suis la consigne affichée.", "error"); }
  });
  const windowQuizItems = [
    { context: "Tu veux lire un long document sans être gêné.", question: "Quelle commande utilise tout l’écran ?", answers: ["Réduire —", "Agrandir □", "Fermer ×", "Clic droit"], correct: 1, hint: "Le symbole ressemble à un carré.", explanation: "Exact : □ agrandit la fenêtre pour offrir plus d’espace." },
    { context: "Tu dois regarder le bureau, puis revenir au document.", question: "Quelle action garde le document ouvert ?", answers: ["Le réduire", "Le fermer", "Éteindre l’écran", "Le supprimer"], correct: 0, hint: "L’application doit rester dans la barre des tâches.", explanation: "Bien joué : réduire cache temporairement la fenêtre sans fermer le document." },
    { context: "Writer et le navigateur sont ouverts en même temps.", question: "Comment passer rapidement de l’un à l’autre ?", answers: ["Les fermer", "Cliquer leurs boutons dans la barre des tâches", "Redémarrer", "Double-cliquer sur le fond"], correct: 1, hint: "Les applications ouvertes sont visibles tout en bas.", explanation: "Oui : la barre des tâches permet de choisir la fenêtre active." },
    { context: "Le travail est enregistré et l’application ne sert plus.", question: "Quel bouton termine la fenêtre ?", answers: ["—", "□", "×", "⊞"], correct: 2, hint: "Ce symbole est placé tout à droite de la barre de titre.", explanation: "Exact : × ferme la fenêtre. On vérifie d’abord que le travail est enregistré." }
  ];
  const startWindowQuiz = createQuiz({
    arena: document.getElementById("windowQuiz"), count: document.getElementById("windowQuizCount"),
    context: document.getElementById("windowQuizContext"), question: document.getElementById("windowQuizQuestion"), answers: document.getElementById("windowQuizAnswers"),
    feedback: windowFeedback, items: windowQuizItems, keyPrefix: "window-quiz", skill: "windows", noun: "Incident",
    endLabel: "Passer au défi Souris →",
    onComplete: () => {
      state.windowQuizComplete = true;
      windowStep.textContent = "✓";
      windowPrompt.innerHTML = "Tu sais manipuler une fenêtre <strong>et choisir la bonne commande.</strong>";
      setFeedback(windowFeedback, "Défi 2 terminé : commandes validées !", "success");
      showScreen("challenge3");
    }
  });
  windowNext.addEventListener("click", () => {
    if (!state.windowQuizStarted) {
      state.windowQuizStarted = true;
      document.getElementById("windowDesktop").hidden = true;
      document.getElementById("windowQuiz").hidden = false;
      document.getElementById("windowPhaseLabel").textContent = "MANCHE 2 · RÉSOUS LES INCIDENTS";
      windowStep.textContent = "?";
      windowPrompt.innerHTML = "Choisis la commande qui convient <strong>sans perdre le travail.</strong>";
      windowNext.hidden = true;
      setFeedback(windowFeedback, "Prends le temps d’imaginer le résultat de chaque commande.");
      startWindowQuiz();
    } else if (state.windowQuizComplete) showScreen("challenge3");
  });

  // Défi 3 — gestes de la souris.
  const mouseTasks = [
    "Fais un <strong>clic simple</strong> sur l’interrupteur.",
    "Ouvre le coffre avec un <strong>double-clic</strong> rapide.",
    "Fais un <strong>clic droit</strong> sur le fichier pour afficher son menu.",
    "<strong>Glisse-dépose</strong> le fichier dans le dossier « À ranger »."
  ];
  const stages = [...document.querySelectorAll(".gesture-stage")];
  const mousePrompt = document.getElementById("mousePrompt");
  const mouseStep = document.getElementById("mouseStep");
  const mouseFeedback = document.getElementById("mouseFeedback");
  const mouseNext = document.getElementById("mouseNext");
  let fileSelected = false;

  function advanceMouse(expected, success) {
    if (state.mouseIndex !== expected) return;
    state.attempts.mouse++;
    addPoints(`mouse-${expected}`, 100);
    state.mouseIndex++;
    setFeedback(mouseFeedback, success, "success");
    if (state.mouseIndex === mouseTasks.length) {
      mouseStep.textContent = "✓";
      mousePrompt.innerHTML = "Les quatre gestes sont maîtrisés. <strong>Choisis maintenant le bon au bon moment !</strong>";
      mouseNext.disabled = false;
      mouseNext.textContent = "Manche 2 →";
      return;
    }
    stages.forEach((stage, index) => stage.hidden = index !== state.mouseIndex);
    mouseStep.textContent = String(state.mouseIndex + 1);
    mousePrompt.innerHTML = mouseTasks[state.mouseIndex];
  }

  document.getElementById("clickTarget").addEventListener("click", event => { event.currentTarget.classList.add("on"); advanceMouse(0, "Clic simple réussi : un appui, une action."); });
  let doubleClickTimer;
  document.getElementById("doubleTarget").addEventListener("dblclick", event => { clearTimeout(doubleClickTimer); event.currentTarget.classList.add("open"); advanceMouse(1, "Double-clic réussi : le coffre est ouvert."); });
  document.getElementById("doubleTarget").addEventListener("click", () => {
    if (state.mouseIndex !== 1) return;
    clearTimeout(doubleClickTimer);
    doubleClickTimer = setTimeout(() => {
      if (state.mouseIndex !== 1) return;
      recordMistake("mouse", "mouse-1");
      setFeedback(mouseFeedback, "Encore ! Deux clics très rapprochés ouvrent le coffre.", "error");
    }, 280);
  });
  document.getElementById("rightTarget").addEventListener("contextmenu", event => { event.preventDefault(); document.getElementById("contextMenu").hidden = false; advanceMouse(2, "Clic droit réussi : le menu des actions apparaît."); });
  document.getElementById("rightTarget").addEventListener("click", () => { if (state.mouseIndex === 2) { recordMistake("mouse", "mouse-2"); setFeedback(mouseFeedback, "Ce fichier attend un clic avec le bouton droit de la souris.", "error"); } });
  const dragFile = document.getElementById("dragFile");
  const dropFolder = document.getElementById("dropFolder");
  dragFile.addEventListener("dragstart", event => { event.dataTransfer.setData("text/plain", "rapport.txt"); event.dataTransfer.effectAllowed = "move"; });
  dropFolder.addEventListener("dragover", event => { event.preventDefault(); dropFolder.classList.add("over"); });
  dropFolder.addEventListener("dragleave", () => dropFolder.classList.remove("over"));
  dropFolder.addEventListener("drop", event => { event.preventDefault(); dropFolder.classList.remove("over"); dragFile.hidden = true; advanceMouse(3, "Glisser-déposer réussi : le fichier est rangé !"); });
  dragFile.addEventListener("click", () => { fileSelected = true; dragFile.classList.add("is-selected"); setFeedback(mouseFeedback, "Fichier sélectionné. Clique maintenant sur le dossier pour le déplacer."); });
  const fallbackDrop = () => {
    if (fileSelected && state.mouseIndex === 3) { dragFile.hidden = true; advanceMouse(3, "Fichier rangé ! C’était la méthode de secours sans glissement."); }
    else if (state.mouseIndex === 3) { recordMistake("mouse", "mouse-3"); setFeedback(mouseFeedback, "Sélectionne d’abord le fichier, puis déplace-le vers le dossier.", "error"); }
  };
  dropFolder.addEventListener("click", fallbackDrop);
  dropFolder.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") fallbackDrop(); });
  const mouseQuizItems = [
    { context: "Tu veux sélectionner un bouton « Enregistrer ».", question: "Quel geste suffit ?", answers: ["Clic simple", "Double-clic", "Clic droit", "Glisser-déposer"], correct: 0, hint: "Un bouton se déclenche avec un seul appui.", explanation: "Exact : un clic simple suffit pour actionner un bouton." },
    { context: "Tu veux ouvrir le dossier « TICE » depuis le bureau.", question: "Quel geste utilises-tu ?", answers: ["Clic simple", "Double-clic", "Clic droit", "Glisser-déposer"], correct: 1, hint: "Sur le bureau, ouvrir demande deux clics rapides.", explanation: "Bien vu : le double-clic ouvre le dossier." },
    { context: "Tu veux afficher les actions possibles sur un fichier.", question: "Quel geste ouvre le menu contextuel ?", answers: ["Clic simple", "Double-clic", "Clic droit", "Glisser-déposer"], correct: 2, hint: "Le nom de ce menu contient le mot « contexte ».", explanation: "Exact : le clic droit affiche le menu contextuel." },
    { context: "Tu veux ranger une image dans le dossier « Images ».", question: "Quel geste déplace l’élément ?", answers: ["Clic simple", "Double-clic", "Clic droit", "Glisser-déposer"], correct: 3, hint: "Il faut maintenir le bouton pendant le déplacement.", explanation: "Oui : on maintient, on glisse, puis on relâche dans le dossier." },
    { context: "Tu veux placer le curseur dans une zone de texte.", question: "Quel geste est le plus direct ?", answers: ["Clic simple", "Double-clic", "Clic droit", "Glisser-déposer"], correct: 0, hint: "Il suffit de désigner l’endroit où écrire.", explanation: "Exact : un clic simple place le curseur dans le texte." },
    { context: "Tu as ouvert un menu par erreur avec la souris.", question: "Quel geste simple peut le refermer ?", answers: ["Cliquer ailleurs", "Faire dix clics", "Faire glisser l’écran", "Éteindre l’ordinateur"], correct: 0, hint: "Une action légère suffit, sans fermer l’application.", explanation: "Parfait : un clic ailleurs referme généralement le menu." }
  ];
  const startMouseQuiz = createQuiz({
    arena: document.getElementById("mouseQuiz"), count: document.getElementById("mouseQuizCount"),
    context: document.getElementById("mouseQuizContext"), question: document.getElementById("mouseQuizQuestion"), answers: document.getElementById("mouseQuizAnswers"),
    feedback: mouseFeedback, items: mouseQuizItems, keyPrefix: "mouse-quiz", skill: "mouse", noun: "Situation",
    endLabel: "Passer au défi bonus →",
    onComplete: () => {
      state.mouseQuizComplete = true;
      mouseStep.textContent = "✓";
      mousePrompt.innerHTML = "Tu réalises les gestes <strong>et tu sais quand les utiliser.</strong>";
      setFeedback(mouseFeedback, "Défi 3 terminé : gestes de souris validés !", "success");
      showScreen("bonus");
    }
  });
  mouseNext.addEventListener("click", () => {
    if (!state.mouseQuizStarted) {
      state.mouseQuizStarted = true;
      document.querySelector(".gesture-lab").hidden = true;
      document.getElementById("mouseQuiz").hidden = false;
      document.getElementById("mousePhaseLabel").textContent = "MANCHE 2 · CHOISIS LE BON GESTE";
      mouseStep.textContent = "?";
      mousePrompt.innerHTML = "Lis la situation et choisis <strong>le geste le plus efficace.</strong>";
      mouseNext.hidden = true;
      setFeedback(mouseFeedback, "Certaines réponses se ressemblent : pense au résultat attendu.");
      startMouseQuiz();
    } else if (state.mouseQuizComplete) showScreen("bonus");
  });

  // Bonus — raccourcis clavier simulés localement.
  const sourceText = document.getElementById("sourceText");
  const targetText = document.getElementById("targetText");
  const keyboardLab = document.querySelector("#bonus .keyboard-lab");
  const keyboardPrompt = document.getElementById("keyboardPrompt");
  const keyboardStep = document.getElementById("keyboardStep");
  const keyboardFeedback = document.getElementById("keyboardFeedback");
  const finishButton = document.getElementById("finishButton");
  let copiedText = "";
  const keyboardTasks = [
    "Clique dans le message, puis appuie sur <kbd>Ctrl</kbd> + <kbd>A</kbd> pour tout sélectionner.",
    "Garde le texte sélectionné et appuie sur <kbd>Ctrl</kbd> + <kbd>C</kbd> pour le copier.",
    "Clique dans la boîte de transmission et appuie sur <kbd>Ctrl</kbd> + <kbd>V</kbd> pour coller."
  ];

  function advanceKeyboard(expected, success) {
    if (state.keyboardIndex !== expected) return;
    state.attempts.keyboard++;
    addPoints(`keyboard-${expected}`, expected === 2 ? 200 : 100);
    state.keyboardIndex++;
    setFeedback(keyboardFeedback, success, "success");
    if (state.keyboardIndex === keyboardTasks.length) {
      keyboardStep.textContent = "✓";
      keyboardPrompt.innerHTML = "Les raccourcis sont acquis. <strong>Il reste une mission de saisie !</strong>";
      finishButton.disabled = false;
      finishButton.textContent = "Mission de saisie →";
    } else {
      keyboardStep.textContent = String(state.keyboardIndex + 1);
      keyboardPrompt.innerHTML = keyboardTasks[state.keyboardIndex];
    }
  }

  sourceText.addEventListener("keydown", event => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === "a" && state.keyboardIndex === 0) {
      event.preventDefault(); sourceText.select(); advanceKeyboard(0, "Tout le message est sélectionné.");
    } else if (key === "c" && state.keyboardIndex === 1) {
      event.preventDefault(); copiedText = sourceText.value.substring(sourceText.selectionStart, sourceText.selectionEnd);
      if (copiedText === sourceText.value) advanceKeyboard(1, "Message copié dans la mémoire de cette page.");
      else { recordMistake("keyboard", "keyboard-1"); setFeedback(keyboardFeedback, "Sélectionne d’abord tout le message avec Ctrl + A.", "error"); }
    }
  });
  sourceText.addEventListener("copy", event => {
    if (state.keyboardIndex !== 1) return;
    copiedText = sourceText.value.substring(sourceText.selectionStart, sourceText.selectionEnd);
    if (copiedText !== sourceText.value) {
      recordMistake("keyboard", "keyboard-1");
      setFeedback(keyboardFeedback, "Sélectionne d’abord tout le message avec Ctrl + A.", "error");
      return;
    }
    event.preventDefault();
    if (event.clipboardData) event.clipboardData.setData("text/plain", copiedText);
    advanceKeyboard(1, "Message copié dans la mémoire de cette page.");
  });
  targetText.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v" && state.keyboardIndex === 2) {
      event.preventDefault(); targetText.value = copiedText;
      if (copiedText) advanceKeyboard(2, "Message collé : les trois raccourcis sont acquis !");
      else { recordMistake("keyboard", "keyboard-2"); setFeedback(keyboardFeedback, "Rien n’a encore été copié. Reprends les étapes dans l’ordre.", "error"); }
    }
  });
  targetText.addEventListener("paste", event => {
    if (state.keyboardIndex !== 2) return;
    const pasted = copiedText || event.clipboardData?.getData("text/plain") || "";
    if (!pasted) return;
    event.preventDefault();
    targetText.value = pasted;
    advanceKeyboard(2, "Message collé : les trois raccourcis sont acquis !");
  });

  const typingPhrases = ["Bonjour Pixel !", "Je range mes fichiers dans le bon dossier."];
  const typingArena = document.getElementById("typingArena");
  const typingInput = document.getElementById("typingInput");
  const typingModel = document.getElementById("typingModel");
  const typingCount = document.getElementById("typingCount");
  const typingCounter = document.getElementById("typingCounter");
  const typingClue = document.getElementById("typingClue");
  const typingValidate = document.getElementById("typingValidate");

  typingInput.addEventListener("input", () => {
    const length = [...typingInput.value].length;
    typingCounter.textContent = `${length} caractère${length > 1 ? "s" : ""}`;
    typingInput.classList.remove("has-error");
  });

  function prepareTypingPhrase(index) {
    state.typingIndex = index;
    state.typingReadyNext = false;
    typingModel.textContent = typingPhrases[index];
    typingCount.textContent = `Phrase ${index + 1} / ${typingPhrases.length}`;
    typingInput.value = "";
    typingInput.className = "typing-input";
    typingCounter.textContent = "0 caractère";
    typingClue.textContent = index === 0 ? "Attention à la majuscule et à l’espace avant !" : "Vérifie l’accent et le point final.";
    typingValidate.textContent = "Vérifier ma phrase";
    typingInput.focus();
  }

  typingValidate.addEventListener("click", () => {
    if (state.typingReadyNext) {
      prepareTypingPhrase(1);
      return;
    }
    const expected = typingPhrases[state.typingIndex];
    if (typingInput.value !== expected) {
      recordMistake("keyboard", `keyboard-typing-${state.typingIndex}`);
      typingInput.classList.add("has-error");
      const firstDifference = [...expected].findIndex((char, index) => char !== [...typingInput.value][index]);
      typingClue.textContent = firstDifference < 0
        ? (typingInput.value.length > expected.length ? "Il y a un caractère en trop à la fin." : "Il manque encore un ou plusieurs caractères.")
        : `Regarde bien autour du caractère ${firstDifference + 1}.`;
      setFeedback(keyboardFeedback, "Presque ! Compare les deux phrases caractère par caractère.", "error");
      return;
    }
    typingInput.classList.add("is-correct");
    addPoints(`keyboard-typing-${state.typingIndex}`, 300);
    setFeedback(keyboardFeedback, "Saisie exacte : majuscules, espaces et ponctuation sont corrects !", "success");
    if (state.typingIndex === 0) {
      state.typingReadyNext = true;
      typingValidate.textContent = "Phrase suivante →";
    } else {
      state.bonusComplete = true;
      typingValidate.disabled = true;
      keyboardStep.textContent = "✓";
      keyboardPrompt.innerHTML = "Tu sais copier, coller et saisir avec précision. <strong>Bonus réussi !</strong>";
      finishButton.disabled = false;
      finishButton.textContent = "Voir mon bilan →";
    }
  });

  document.getElementById("resetBonusButton").addEventListener("click", () => {
    state.keyboardIndex = 0;
    state.typingStarted = false;
    state.typingIndex = 0;
    state.typingReadyNext = false;
    state.bonusComplete = false;
    state.attempts.keyboard = 0;
    copiedText = "";

    sourceText.value = sourceText.defaultValue;
    sourceText.setSelectionRange(0, 0);
    targetText.value = "";
    keyboardLab.hidden = false;
    typingArena.hidden = true;
    typingInput.value = "";
    typingInput.className = "typing-input";
    typingModel.textContent = typingPhrases[0];
    typingCount.textContent = `Phrase 1 / ${typingPhrases.length}`;
    typingCounter.textContent = "0 caractère";
    typingClue.textContent = "Observe chaque signe.";
    typingValidate.disabled = false;
    typingValidate.textContent = "Vérifier ma phrase";

    document.getElementById("keyboardPhaseLabel").textContent = "MANCHE 1 · RACCOURCIS";
    keyboardStep.textContent = "1";
    keyboardPrompt.innerHTML = keyboardTasks[0];
    finishButton.disabled = true;
    finishButton.textContent = "Voir mon bilan →";
    setFeedback(keyboardFeedback, "Défi réinitialisé. Le message et toutes les étapes sont de nouveau prêts.", "success");
    sourceText.focus();
  });

  function showFinal() {
    showScreen("final");
    const skillDefinitions = [
      { key: "zones", prefix: "zone-", label: "Repérage", icon: "⌖", badge: "Œil de lynx", description: "Bureau, icônes, fenêtres et barre des tâches", advice: "Revoir le rôle des différentes zones de l’écran." },
      { key: "windows", prefix: "window-", label: "Fenêtres", icon: "▣", badge: "Pilote de fenêtres", description: "Ouvrir, réduire, agrandir, fermer et changer de fenêtre", advice: "T’entraîner à distinguer réduire, agrandir et fermer." },
      { key: "mouse", prefix: "mouse-", label: "Souris", icon: "↖", badge: "As de la souris", description: "Clic, double-clic, clic droit et glisser-déposer", advice: "Choisir le bon geste de souris selon le résultat attendu." },
      { key: "keyboard", prefix: "keyboard-", label: "Clavier", icon: "⌨", badge: "Messager rapide", description: "Raccourcis Ctrl + A, C, V et saisie exacte", advice: "Soigner les majuscules, espaces, accents et signes de ponctuation." }
    ];

    const pointsForKey = key => {
      if (key.startsWith("keyboard-typing-")) return 300;
      return key === "keyboard-2" ? 200 : 100;
    };
    const results = skillDefinitions.map(skill => {
      const gross = [...state.awarded].filter(key => key.startsWith(skill.prefix)).reduce((sum, key) => sum + pointsForKey(key), 0);
      const score = Math.max(0, gross - state.penalties[skill.key]);
      const percent = Math.round(score / 10);
      const errors = Math.round(state.penalties[skill.key] / ERROR_PENALTY);
      const level = percent >= 80 ? "Acquis" : percent >= 60 ? "En bonne voie" : "À renforcer";
      const levelClass = percent >= 80 ? "acquired" : percent >= 60 ? "progressing" : "reinforce";
      return { ...skill, gross, score, percent, errors, level, levelClass };
    });

    const finalScore = getScore();
    const finalPercent = Math.round(finalScore / MAX_SCORE * 100);
    document.getElementById("finalScore").textContent = finalScore;
    document.getElementById("finalPercent").textContent = `${finalPercent} %`;
    const stars = finalPercent >= 90 ? 3 : finalPercent >= 75 ? 2 : finalPercent >= 60 ? 1 : 0;
    document.getElementById("starRow").textContent = `${"★ ".repeat(stars)}${"☆ ".repeat(3 - stars)}`.trim();
    const rank = finalPercent >= 90 ? "Maître du bureau" : finalPercent >= 75 ? "Pilote numérique" : finalPercent >= 60 ? "Explorateur du bureau" : "Apprenti explorateur";
    document.getElementById("rankBadge").textContent = rank;
    document.getElementById("errorSummary").textContent = `${state.errors} erreur${state.errors > 1 ? "s" : ""} corrigée${state.errors > 1 ? "s" : ""}`;
    document.getElementById("totalErrors").textContent = state.errors;
    document.getElementById("reportDate").textContent = new Intl.DateTimeFormat("fr-FR").format(new Date());
    document.getElementById("finalMessage").textContent = finalPercent >= 90
      ? "Excellente maîtrise : tu observes, tu choisis et tu agis avec précision."
      : finalPercent >= 75
        ? "Mission réussie : tes bases sont solides et quelques gestes peuvent encore gagner en précision."
        : finalPercent >= 60
          ? "Bon début : tu as compris l’essentiel, mais certaines commandes méritent encore un entraînement."
          : "Tu as terminé la mission : appuie-toi sur le bilan pour revoir les gestes qui restent fragiles.";

    document.getElementById("skillsList").innerHTML = results.map(result => `
      <li class="skill-result ${result.levelClass}">
        <span class="skill-icon">${result.icon}</span>
        <div class="skill-copy"><strong>${result.label}</strong><small>${result.percent} % · ${result.level}</small><span class="skill-meter"><i style="width:${result.percent}%"></i></span></div>
      </li>`).join("");

    document.getElementById("badgeShelf").innerHTML = results.map(result => `
      <div class="report-badge ${result.percent >= 80 ? "earned" : "locked"}"><span>${result.icon}</span><strong>${result.badge}</strong><small>${result.percent >= 80 ? "Obtenu" : "À débloquer"}</small></div>`).join("") +
      `<div class="report-badge earned"><span>${state.errors === 0 ? "★" : "↻"}</span><strong>${state.errors === 0 ? "Sans faute" : "Persévérant"}</strong><small>${state.errors === 0 ? "Aucune erreur" : `${state.errors} erreur${state.errors > 1 ? "s" : ""} corrigée${state.errors > 1 ? "s" : ""}`}</small></div>`;

    const strongest = [...results].sort((a, b) => b.percent - a.percent)[0];
    const weakest = [...results].sort((a, b) => a.percent - b.percent)[0];
    document.getElementById("strengthText").textContent = `${strongest.label} : ${strongest.percent} %. ${strongest.description}.`;
    document.getElementById("goalText").textContent = weakest.percent >= 90
      ? "Conserver cette méthode : lire la consigne, observer, agir puis vérifier."
      : weakest.advice;

    document.getElementById("reportTableBody").innerHTML = results.map(result => `
      <tr>
        <th scope="row"><span class="table-icon">${result.icon}</span>${result.label}</th>
        <td>${result.description}</td>
        <td><strong>${result.score} / 1000</strong><small>${result.percent} %</small></td>
        <td>${result.errors}</td>
        <td><span class="level-tag ${result.levelClass}">${result.level}</span></td>
      </tr>`).join("");
  }
  finishButton.addEventListener("click", () => {
    if (!state.typingStarted) {
      state.typingStarted = true;
      keyboardLab.hidden = true;
      typingArena.hidden = false;
      document.getElementById("keyboardPhaseLabel").textContent = "MANCHE 2 · SAISIS AVEC PRÉCISION";
      keyboardStep.textContent = "⌨";
      keyboardPrompt.innerHTML = "Recopie deux phrases <strong>exactement comme le modèle.</strong>";
      finishButton.disabled = true;
      finishButton.textContent = "Voir mon bilan →";
      setFeedback(keyboardFeedback, "Prends ton temps : chaque caractère compte.");
      prepareTypingPhrase(0);
    } else if (state.bonusComplete) showFinal();
  });
  document.getElementById("printButton").addEventListener("click", () => window.print());
  document.getElementById("restartButton").addEventListener("click", () => window.location.reload());
})();
