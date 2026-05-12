// Adds a "copy link to section" icon next to each h2/h3 heading.
// Headings already have ids from rehype-slug.
(function () {
  function htmlToElement(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  function hasParentLink(node) {
    let p = node.parentNode;
    while (p) {
      const n = p.nodeName.toLowerCase();
      if (n === "a") return true;
      if (n === "body") return false;
      p = p.parentNode;
    }
    return false;
  }

  function attachCopyHandler(el, link) {
    const tip = el.querySelector(".copy-to-clipboard-wrapper");
    const tipDone = el.querySelector(".copied-to-clipboard-wrapper");
    let tHide = null, tFade = null;

    el.addEventListener("mouseenter", () => {
      tip.classList.remove("invisible");
      tip.style.opacity = "1";
    });
    el.addEventListener("mouseleave", () => {
      tip.classList.add("invisible");
      tip.style.opacity = "0";
    });

    el.addEventListener("click", (e) => {
      e.preventDefault();
      navigator.clipboard.writeText(link);
      if (tHide) {
        clearTimeout(tHide);
        clearTimeout(tFade);
      }
      tip.classList.add("invisible");
      tip.style.opacity = "0";
      tipDone.classList.remove("invisible");
      tipDone.style.opacity = "1";
      tHide = setTimeout(() => tipDone.classList.add("invisible"), 1200);
      tFade = setTimeout(() => (tipDone.style.opacity = "0"), 1000);
    });
  }

  const ICON_HTML =
    '<a class="copy-clip" title="Copy link to this section">' +
    '<svg width="20" height="20" viewBox="0 0 32 32" fill="#C6C9D2" xmlns="http://www.w3.org/2000/svg">' +
    '<path fill-rule="evenodd" clip-rule="evenodd" d="M19.3 9.2a2.6 2.6 0 0 1 3.7 3.7l-3.7 3.7a2.6 2.6 0 0 1-3.7 0 .9.9 0 1 0-1.3 1.3 4.4 4.4 0 0 0 6.2 0l3.7-3.7a4.4 4.4 0 0 0-6.2-6.2L16 9.7a.9.9 0 1 0 1.3 1.3l2-1.8zM13 15.4a2.6 2.6 0 0 1 3.7 0 .9.9 0 1 0 1.3-1.3 4.4 4.4 0 0 0-6.2 0l-3.8 3.8a4.4 4.4 0 0 0 6.2 6.2L16 22.6a.9.9 0 1 0-1.3-1.3l-1.9 1.8a2.6 2.6 0 1 1-3.7-3.7l3.8-3.8z"/>' +
    "</svg>" +
    '<div class="copy-to-clipboard-wrapper invisible"><div class="copied-to-clipboard">Copy link</div></div>' +
    '<div class="copied-to-clipboard-wrapper invisible"><div class="copied-to-clipboard">Copied</div></div>' +
    "</a>";

  document.querySelectorAll("article.docs-content h2[id], article.docs-content h3[id]").forEach((h) => {
    if (hasParentLink(h) || h.innerHTML.indexOf("<a ") > -1) return;
    const wrapper = document.createElement("div");
    wrapper.classList.add("copy-clip-container", h.tagName.toLowerCase());
    h.parentNode.replaceChild(wrapper, h);
    wrapper.appendChild(h);
    const icon = htmlToElement(ICON_HTML);
    wrapper.appendChild(icon);
    const url = location.href.split("#")[0] + "#" + h.id;
    attachCopyHandler(icon, url);
  });
})();
