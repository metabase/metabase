jest.mock("./helper-a", () => ({ name: "mocked for import" }));
test("import() of a mocked module gives the mock", async () => {
  const helper = await import("./helper-a");
  expect(helper.name).toBe("mocked for import");
});
