// Wraps wide tables in an overflow-x scroll container with a fade indicator.
(function () {
  const tables = document.querySelectorAll("article.docs-content table");

  tables.forEach((table) => {
    const parent = table.parentNode;
    const wrapper = document.createElement("div");
    wrapper.classList.add("table-overflow-wrapper");
    const container = document.createElement("div");
    container.classList.add("table-overflow");
    parent.insertBefore(wrapper, table);
    wrapper.appendChild(container);
    container.appendChild(table);
  });

  function check() {
    document.querySelectorAll(".table-overflow-wrapper").forEach((wrapper) => {
      const container = wrapper.firstElementChild;
      const table = container.firstElementChild;
      const overflowing =
        container.getBoundingClientRect().width <
        table.getBoundingClientRect().width;
      wrapper.classList.toggle("table-overflow-indicator", overflowing);
    });
  }
  window.addEventListener("resize", check);
  check();
})();
