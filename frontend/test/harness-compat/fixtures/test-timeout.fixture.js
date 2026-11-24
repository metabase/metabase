it(
  "fails on its own timeout",
  () => new Promise((resolve) => setTimeout(resolve, 200)),
  50,
);
