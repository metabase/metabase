afterEach(() => jest.useRealTimers());
test("now option sets the clock", () => {
  jest.useFakeTimers({ now: new Date("2020-01-01T00:00:00Z") });
  expect(Date.now()).toBe(Date.parse("2020-01-01T00:00:00Z"));
});
test("setSystemTime moves the clock", () => {
  jest.useFakeTimers();
  jest.setSystemTime(1000);
  expect(Date.now()).toBe(1000);
  expect(new Date().getTime()).toBe(1000);
});
test("performance.now is fake", () => {
  jest.useFakeTimers();
  const start = performance.now();
  jest.advanceTimersByTime(500);
  expect(performance.now() - start).toBe(500);
});
test("getRealSystemTime returns the real time", () => {
  jest.useFakeTimers({ now: 0 });
  expect(jest.getRealSystemTime()).toBeGreaterThan(1e12);
});
