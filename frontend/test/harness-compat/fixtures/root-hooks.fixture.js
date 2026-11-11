beforeAll(() => {
  throw new Error("root beforeAll boom");
});
afterAll(() => {
  throw new Error("root afterAll boom");
});
it("fails because of the root beforeAll", () => {
  expect(1).toBe(1);
});
