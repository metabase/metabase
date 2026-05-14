// Click-to-expand toggle for the footer's "Choosing Metabase" / "More
// Resources" lists. Vendored from
// `metabase.github.io/_includes/footer-scripts.html`. Each `.more-resources`
// anchor is paired with an adjacent `.more-resources-wrapper.hide` list — the
// handler flips `.hide` on the wrapper and `.chevron-up` on the chevron.
(function() {
  document.addEventListener("DOMContentLoaded", function() {
    const $moreResourcesButtons = document.querySelectorAll(".more-resources");
    $moreResourcesButtons.forEach(($button) => {
      $button.addEventListener("click", () => {
        $button.nextElementSibling.classList.toggle("hide");
        $button
          .querySelector(".more-resources-chevron")
          .classList.toggle("chevron-up");
      });
    });
  });
})();
