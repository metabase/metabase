const { act, createElement } = require("react");
const { createRoot } = require("react-dom/client");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("renders in a new worker", () => {
  const container = document.createElement("div");
  act(() => createRoot(container).render(createElement("p", null, "ok")));
  expect(container.textContent).toBe("ok");
});
