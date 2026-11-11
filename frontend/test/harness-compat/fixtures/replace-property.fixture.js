const target = { value: 1 };
test("replaceProperty replaces and restores", () => {
  const replaced = jest.replaceProperty(target, "value", 2);
  expect(target.value).toBe(2);
  replaced.restore();
  expect(target.value).toBe(1);
});
