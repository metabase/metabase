// Scroll-spy for the right-rail Table of Contents.
// The list of links is server-rendered by TableOfContents.astro; this just
// updates `.selected` based on which heading is currently in view.
(function () {
  function init() {
    const headers = Array.from(
      document.querySelectorAll("article.docs-content h2[id]"),
    );
    const container = document.getElementById("sub-navigation-content");
    if (!container || headers.length === 0) return;

    const linkFor = {};
    container.querySelectorAll("a[href^='#']").forEach((a) => {
      const id = a.getAttribute("href").slice(1);
      linkFor[id] = a;
    });

    function update() {
      let activeId = headers[0]?.id;
      for (const h of headers) {
        if (h.getBoundingClientRect().top <= 80) activeId = h.id;
      }
      Object.entries(linkFor).forEach(([id, link]) => {
        link.classList.toggle("selected", id === activeId);
      });
    }

    document.addEventListener("scroll", update, { passive: true });
    update();
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
