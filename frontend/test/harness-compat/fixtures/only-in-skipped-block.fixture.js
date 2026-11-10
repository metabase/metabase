describe.skip("skipped block", () => {
  // The fixture checks that a skipped block wins over a focused test.
  // eslint-disable-next-line no-only-tests/no-only-tests
  test.only("only inside skipped", () => {
    throw new Error("should not run");
  });
});
test("other", () => {});
