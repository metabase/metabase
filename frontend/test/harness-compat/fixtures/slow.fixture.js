it("fails only with --testTimeout=25", async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));
});
