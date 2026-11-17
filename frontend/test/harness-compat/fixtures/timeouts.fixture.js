describe("a slow beforeEach with its own timeout", () => {
  beforeEach(() => new Promise((resolve) => setTimeout(resolve, 200)), 50);
  it("fails on the hook timeout", () => {});
});
