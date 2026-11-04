test("isolateModules gives a fresh module", () => {
  let first;
  let second;
  jest.isolateModules(() => {
    first = require("./helper-a");
  });
  jest.isolateModules(() => {
    second = require("./helper-a");
  });
  expect(first).not.toBe(second);
  expect(require("./helper-a")).not.toBe(first);
});
