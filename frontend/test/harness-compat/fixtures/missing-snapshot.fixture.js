test("fails under --ci without a committed snapshot", () => {
  expect({ a: 2 }).toMatchSnapshot();
});
