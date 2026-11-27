const { createElement } = require("react");

const {
  leaveReactStuck,
  recordRun,
  renderInto,
  renderParagraph,
} = require("./react-helpers");

recordRun(__filename);

test("leaves React inside a commit", () => {
  leaveReactStuck();
});

test("is skipped, because React cannot render", () => {
  expect(renderParagraph()).toBe("ok");
});

describe("a later block", () => {
  beforeAll(() => renderInto(createElement("div")));
  test("is skipped too", () => {});
});
