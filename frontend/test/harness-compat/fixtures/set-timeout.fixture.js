jest.setTimeout(25);

it("fails on the timeout of jest.setTimeout", async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));
});
