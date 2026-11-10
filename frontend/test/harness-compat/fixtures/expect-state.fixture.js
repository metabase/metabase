describe("block", () => {
  test("knows its test path and name", () => {
    expect(expect.getState().testPath).toBe(__filename);
    expect(expect.getState().currentTestName).toBe(
      "block knows its test path and name",
    );
  });
});
