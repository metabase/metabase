test.failing("a failing test that throws passes", () => {
  throw new Error("expected");
});
test.failing("a failing test that passes fails", () => {});
test.failing.each([1, 2])("failing each %i", () => {
  throw new Error("expected");
});
