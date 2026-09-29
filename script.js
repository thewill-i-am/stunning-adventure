// Para desbloquear otra carta, cifrá sus páginas y agregá aquí sus datos.
const letters = [
  {
    number: 1,
    title: "Primera Carta - 27 de agosto 2026",
    sources: Array.from({ length: 5 }, (_, index) => `assets/carta-01/pagina-0${index}.webp`),
    pages: [],
  },
];

const gate = document.querySelector("#gate");
const app = document.querySelector("#app");
const keyForm = document.querySelector("#key-form");
const keyInput = document.querySelector("#secret-key");
const keyError = document.querySelector("#key-error");
const keyButton = keyForm.querySelector("button");
const envelope = document.querySelector("#envelope");
const opening = document.querySelector("#inicio");
const openEnvelope = document.querySelector("#open-envelope");
const deliveryNote = document.querySelector("#delivery-note");
const archiveDialog = document.querySelector("#archive-dialog");
const readerDialog = document.querySelector("#reader-dialog");
const letterGrid = document.querySelector("#letter-grid");
const paper = document.querySelector("#paper");
const pageImage = document.querySelector("#letter-page");
const pageCount = document.querySelector("#page-count");
const pageDots = document.querySelector("#page-dots");
const previousPage = document.querySelector("#previous-page");
const nextPage = document.querySelector("#next-page");

let currentPage = 0;
let touchStartX = 0;
let isTurning = false;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function fromBase64(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function decryptPages(password) {
  if (!window.crypto?.subtle) throw new Error("WEB_CRYPTO_UNAVAILABLE");

  const manifestResponse = await fetch("assets/crypto.json", { cache: "no-store" });
  if (!manifestResponse.ok) throw new Error("MANIFEST_UNAVAILABLE");
  const manifest = await manifestResponse.json();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password.trim().normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: manifest.kdf.name,
      hash: manifest.kdf.hash,
      salt: fromBase64(manifest.kdf.salt),
      iterations: manifest.kdf.iterations,
    },
    keyMaterial,
    { name: manifest.cipher, length: 256 },
    false,
    ["decrypt"],
  );
  const urls = [];

  try {
    for (const source of letters[0].sources) {
      const file = manifest.files[source];
      if (!file) throw new Error("ENCRYPTED_PAGE_MISSING");
      const response = await fetch(file.path, { cache: "no-store" });
      if (!response.ok) throw new Error("ENCRYPTED_PAGE_UNAVAILABLE");
      const decrypted = await crypto.subtle.decrypt(
        { name: manifest.cipher, iv: fromBase64(file.iv) },
        key,
        await response.arrayBuffer(),
      );
      urls.push(URL.createObjectURL(new Blob([decrypted], { type: file.type })));
    }
  } catch (error) {
    urls.forEach((url) => URL.revokeObjectURL(url));
    throw error;
  }

  return urls;
}

function unlockSite() {
  gate.hidden = true;
  app.hidden = false;
  document.body.classList.add("is-unlocked");
}

keyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = keyInput.value;
  if (!password.trim()) return;

  keyInput.disabled = true;
  keyButton.disabled = true;
  keyButton.textContent = "Abriendo…";

  try {
    letters[0].pages = await decryptPages(password);
    keyInput.value = "";
    gate.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduceMotion ? 1 : 500, easing: "ease", fill: "forwards" }).finished.then(unlockSite);
  } catch (error) {
    keyForm.classList.remove("is-wrong");
    void keyForm.offsetWidth;
    keyForm.classList.add("is-wrong");
    keyError.textContent = error.name === "OperationError"
      ? "Esa frase no pudo abrir las cartas. Probá otra vez."
      : "No se pudieron cargar las cartas. Revisá la conexión e intentá otra vez.";
    keyInput.disabled = false;
    keyButton.disabled = false;
    keyButton.textContent = "Entrar";
    keyInput.select();
  }
});

keyInput.addEventListener("input", () => {
  keyError.textContent = "";
});

openEnvelope.addEventListener("click", () => {
  envelope.classList.add("is-open");
  openEnvelope.setAttribute("aria-expanded", "true");

  window.setTimeout(() => {
    opening.classList.add("is-revealed");
    deliveryNote.setAttribute("aria-hidden", "false");
    document.querySelector("#read-letter").focus();
  }, reduceMotion ? 20 : 1450);
});

function renderArchive() {
  letterGrid.replaceChildren();

  for (let number = 1; number <= 21; number += 1) {
    const letter = letters.find((item) => item.number === number);
    const card = document.createElement(letter ? "button" : "article");
    card.className = "letter-card";

    if (letter) {
      card.type = "button";
      card.setAttribute("aria-label", `Abrir ${letter.title}`);
      card.innerHTML = `<span class="letter-card__number">${String(number).padStart(2, "0")}</span><span class="letter-card__state">${letter.title}</span>`;
      card.addEventListener("click", () => {
        archiveDialog.close();
        openReader();
      });
    } else {
      card.innerHTML = `<span class="letter-card__number">${String(number).padStart(2, "0")}</span><span class="letter-card__lock" aria-hidden="true"></span><span class="letter-card__state">Aún dormida</span>`;
    }

    letterGrid.append(card);
  }
}

function openArchive() {
  renderArchive();
  archiveDialog.showModal();
}

function renderPage() {
  const letter = letters[0];
  pageImage.src = letter.pages[currentPage];
  pageImage.alt = `Página ${currentPage + 1} de la carta manuscrita`;
  pageCount.textContent = `Página ${currentPage + 1} de ${letter.pages.length}`;
  previousPage.disabled = currentPage === 0;
  nextPage.disabled = currentPage === letter.pages.length - 1;

  [...pageDots.children].forEach((dot, index) => {
    dot.classList.toggle("is-active", index === currentPage);
    dot.setAttribute("aria-current", index === currentPage ? "page" : "false");
  });
}

function turnToPage(index) {
  const lastPage = letters[0].pages.length - 1;
  const nextIndex = Math.max(0, Math.min(index, lastPage));
  if (nextIndex === currentPage || isTurning) return;

  isTurning = true;
  paper.classList.add(nextIndex > currentPage ? "is-turning-next" : "is-turning-previous");

  window.setTimeout(() => {
    currentPage = nextIndex;
    renderPage();
  }, 180);

  window.setTimeout(() => {
    paper.classList.remove("is-turning-next", "is-turning-previous");
    isTurning = false;
  }, 390);
}

function openReader() {
  currentPage = 0;
  renderPage();
  readerDialog.showModal();
  letters[0].pages.slice(1).forEach((src) => {
    const image = new Image();
    image.src = src;
  });
}

letters[0].sources.forEach((_, index) => {
  const dot = document.createElement("button");
  dot.type = "button";
  dot.className = "page-dot";
  dot.setAttribute("aria-label", `Ir a la página ${index + 1}`);
  dot.addEventListener("click", () => turnToPage(index));
  pageDots.append(dot);
});

document.querySelector("#open-archive").addEventListener("click", openArchive);
document.querySelector("#note-open-archive").addEventListener("click", openArchive);
document.querySelector("#read-letter").addEventListener("click", openReader);
document.querySelector("#reader-open-archive").addEventListener("click", () => {
  readerDialog.close();
  openArchive();
});

document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => document.querySelector(`#${button.dataset.close}`).close());
});

previousPage.addEventListener("click", () => turnToPage(currentPage - 1));
nextPage.addEventListener("click", () => turnToPage(currentPage + 1));

paper.addEventListener("touchstart", (event) => {
  touchStartX = event.changedTouches[0].clientX;
}, { passive: true });

paper.addEventListener("touchend", (event) => {
  const distance = event.changedTouches[0].clientX - touchStartX;
  if (Math.abs(distance) > 55) turnToPage(currentPage + (distance < 0 ? 1 : -1));
}, { passive: true });

document.addEventListener("keydown", (event) => {
  if (!readerDialog.open) return;
  if (event.key === "ArrowLeft") turnToPage(currentPage - 1);
  if (event.key === "ArrowRight") turnToPage(currentPage + 1);
});

archiveDialog.addEventListener("click", (event) => {
  if (event.target === archiveDialog) archiveDialog.close();
});

window.addEventListener("pagehide", () => letters.flatMap((letter) => letter.pages).forEach((url) => URL.revokeObjectURL(url)));
