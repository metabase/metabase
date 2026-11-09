afterAll(async () => {
  setTimeout(() => {
    throw new Error("uncaught in afterAll");
  }, 0);
  await new Promise((resolve) => setTimeout(resolve, 20));
});
test("passes", () => {});
