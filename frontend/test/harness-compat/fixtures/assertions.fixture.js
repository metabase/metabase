test("fails on expect.assertions", () => {
  expect.assertions(1);
});
test("fails on expect.hasAssertions", () => {
  expect.hasAssertions();
});
test("passes with its assertion", () => {
  expect.assertions(1);
  expect(1).toBe(1);
});
