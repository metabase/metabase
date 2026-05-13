// Toggles expansion of sidebar groups when the chevron button is clicked.
// Initial expanded state is rendered server-side from the active page's trail
// (see Sidebar.astro / lib/nav.ts); this script only handles user interaction.
//
// Items without a URL (pure group labels) also toggle when the label itself
// is clicked — there's nowhere to navigate to in that case, so the label
// behaves like the chevron.
(function () {
  const sidebar = document.querySelector(".docs-sidebar");
  if (!sidebar) return;

  sidebar.addEventListener("click", function (e) {
    const target = e.target.closest(
      ".docs-sidebar-toggle, .docs-sidebar-group-label",
    );
    if (!target) return;
    const li = target.closest("li.has-children");
    if (!li) return;
    e.preventDefault();
    const expanded = li.classList.toggle("expanded");
    const button = li.querySelector(":scope > .nav-row > .docs-sidebar-toggle");
    if (button) {
      button.setAttribute("aria-expanded", expanded ? "true" : "false");
    }
  });
})();
