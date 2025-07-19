/* global hljs */
// Grab raw HTML (as string) for code view and URL for iframe preview
const rawTemplates = import.meta.glob("./templates/*.html", { as: "raw" });
const urlTemplates = import.meta.glob("./templates/*.html", { as: "url" });

const sidebar = document.getElementById("sidebar");
const codeBlock = document.querySelector("#code code");
const previewFrame = document.getElementById("preview");

/* helpers */
function getFilename(p) {
  return p.split("/").pop();
}

const filenameToPath = Object.keys(rawTemplates).reduce((acc, p) => {
  acc[getFilename(p)] = p;
  return acc;
}, {});

async function openTemplate(path) {
  // update sidebar active state
  document
    .querySelectorAll(".template-item")
    .forEach((n) => n.classList.remove("active"));
  const activeEl = sidebar.querySelector(`[data-path="${path}"]`);
  if (activeEl) activeEl.classList.add("active");

  // fetch code & url
  const [code, url] = await Promise.all([
    rawTemplates[path](),
    urlTemplates[path](),
  ]);

  // highlight
  codeBlock.classList.remove("hljs");
  codeBlock.removeAttribute("data-highlighted");
  codeBlock.textContent = code;
  hljs.highlightElement(codeBlock);

  // update iframe
  previewFrame.src = url;

  // persist in URL (#filename)
  history.replaceState(null, "", `#${getFilename(path)}`);
}

function createItem(name, path) {
  const el = document.createElement("div");
  el.textContent = name;
  el.className = "template-item";
  el.dataset.path = path;
  el.addEventListener("click", () => openTemplate(path));
  return el;
}

// Populate sidebar with available templates
Object.keys(rawTemplates).forEach((path) => {
  sidebar.appendChild(createItem(getFilename(path), path));
});

// Restore selection from URL or default to first
const initialFilename = location.hash.slice(1);
const initialPath =
  filenameToPath[initialFilename] || Object.keys(rawTemplates)[0];
if (initialPath) openTemplate(initialPath);
