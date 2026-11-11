jest.mock("./helper-a");
test("jest.mock without a factory automocks the module", () => {
  const helper = require("./helper-a");
  expect(jest.isMockFunction(helper.call)).toBe(true);
  expect(helper.call()).toBeUndefined();
  expect(helper.name).toBe("real a");
});
