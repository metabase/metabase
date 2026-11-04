jest.mock("./helper-a", () => ({ name: "mocked" }));
test("unmock gives the real module after resetModules", () => {
  expect(require("./helper-a").name).toBe("mocked");
  jest.unmock("./helper-a");
  jest.resetModules();
  expect(require("./helper-a").name).toBe("real a");
});
