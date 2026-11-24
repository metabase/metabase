let generation = 0;
jest.mock("./helper", () => ({ generation: ++generation }));

test("jest.resetModules runs the mock factory again", () => {
  expect(require("./helper").generation).toBe(1);
  jest.resetModules();
  expect(require("./helper").generation).toBe(2);
});
