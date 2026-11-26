const { recordRun, renderParagraph } = require("./react-helpers");

recordRun(__filename);

test("renders in a new worker", () => {
  expect(renderParagraph()).toBe("ok");
});
