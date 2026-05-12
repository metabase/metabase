// Adds a copy button to every <pre><code> block.
(function () {
  const BUTTON_HTML =
    '<div class="copy-button-copy-wrapper">' +
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M6.75 15.5C5.78 15.5 5 14.7 5 13.75V7a2 2 0 0 1 2-2h6.75c1 0 1.75.8 1.75 1.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M17.5 9H11a2 2 0 0 0-2 2v6.5a2 2 0 0 0 2 2h6.5a2 2 0 0 0 2-2V11a2 2 0 0 0-2-2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    "</svg>" +
    '<span class="copy-button-label">Copy</span>' +
    "</div>" +
    '<div class="copy-button-copied-wrapper">' +
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path fill-rule="evenodd" clip-rule="evenodd" d="M19.9 6 21 7.1 10.6 19 4 12l1.1-1.2 5.5 5.9L19.9 6Z" fill="currentColor"/>' +
    "</svg>" +
    '<span class="copy-button-label">Copied</span>' +
    "</div>";

  document.querySelectorAll("pre > code").forEach((code) => {
    if (code.classList.contains("language-plaintext")) return;
    const pre = code.parentNode;
    if (pre.querySelector(".copy-code-button")) return;

    const wrapper = document.createElement("div");
    wrapper.classList.add("code-snippet-wrapper");
    pre.parentNode.replaceChild(wrapper, pre);
    wrapper.appendChild(pre);

    const btn = document.createElement("button");
    btn.classList.add("copy-code-button");
    btn.type = "button";
    btn.innerHTML = BUTTON_HTML;
    wrapper.appendChild(btn);

    const copyEl = btn.querySelector(".copy-button-copy-wrapper");
    const copiedEl = btn.querySelector(".copy-button-copied-wrapper");

    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(code.innerText);
      copyEl.classList.add("d-none");
      copiedEl.classList.add("d-flex");
      setTimeout(() => {
        copyEl.classList.remove("d-none");
        copiedEl.classList.remove("d-flex");
      }, 2000);
    });
  });
})();
