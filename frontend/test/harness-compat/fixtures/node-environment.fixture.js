test("JEST_WORKER_ID is set", () => {
  expect(process.env.JEST_WORKER_ID).toMatch(/^\d+$/);
});
test("NODE_ENV is test", () => {
  expect(process.env.NODE_ENV).toBe("test");
});
test("has no window in the node environment", () => {
  expect(typeof window).toBe("undefined");
});
