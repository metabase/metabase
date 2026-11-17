test("starts with a fresh window", () => {
  const state = {
    href: location.href,
    localStorage: localStorage.getItem("leaked"),
    sessionStorage: sessionStorage.getItem("leaked"),
    cookie: document.cookie,
    title: document.title,
    attribute: document.documentElement.getAttribute("data-leaked"),
    headChildren: document.head.children.length,
    customElement: typeof customElements.get("leaked-element"),
  };
  expect(state).toEqual({
    href: "http://localhost/",
    localStorage: null,
    sessionStorage: null,
    cookie: "",
    title: "",
    attribute: null,
    headChildren: 0,
    customElement: "undefined",
  });
});
