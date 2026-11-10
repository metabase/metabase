const fn = jest.fn();
test("calls the mock", () => {
  fn(1);
});
test("keeps the calls of the previous test without clearMocks", () => {
  expect(fn).toHaveBeenCalledTimes(1);
});
