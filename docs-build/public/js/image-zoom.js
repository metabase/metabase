// Lightbox: click an inline image to open it full-screen.
(function () {
  const overlay = document.createElement("div");
  overlay.classList.add("image-zoom-overlay");
  overlay.style.cssText = [
    "position:fixed", "inset:0", "background:rgba(255,255,255,0.96)",
    "z-index:2000", "display:none", "align-items:center", "justify-content:center",
    "padding:48px", "cursor:zoom-out", "transition:opacity 0.15s",
  ].join(";");

  const overlayImg = document.createElement("img");
  overlayImg.style.cssText = "max-width:100%;max-height:100%;box-shadow:0 4px 24px rgba(0,0,0,0.12);";
  overlay.appendChild(overlayImg);
  document.body.appendChild(overlay);

  overlay.addEventListener("click", () => {
    overlay.style.display = "none";
  });

  document.querySelectorAll("article.docs-content img:not(.no-zoom)").forEach((img) => {
    img.style.cursor = "zoom-in";
    img.addEventListener("click", (e) => {
      e.preventDefault();
      overlayImg.src = img.src;
      overlayImg.alt = img.alt;
      overlay.style.display = "flex";
    });
  });
})();
