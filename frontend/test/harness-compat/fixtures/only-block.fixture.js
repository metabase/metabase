// The fixture checks how jest focuses a block.
// eslint-disable-next-line no-only-tests/no-only-tests
describe.only("focused", () => {
  test("runs", () => {});
  test.skip("skipped inside focused", () => {});
  test.todo("todo inside focused");
});
describe("not focused", () => {
  test("does not run", () => {
    throw new Error("should not run");
  });
});
