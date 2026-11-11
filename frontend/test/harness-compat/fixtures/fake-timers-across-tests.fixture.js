test("leaves fake timers on", () => {
  jest.useFakeTimers();
});
test("still has fake timers in the next test", () => {
  expect(
    jest.isMockFunction(setTimeout) || typeof setTimeout.clock === "object",
  ).toBe(true);
});
