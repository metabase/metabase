test("jest.resetAllMocks does not reach the mocks of an earlier file", () => {
  const kept = process.keptCanvasContext;
  jest.resetAllMocks();
  expect(kept === undefined || kept.measureText("x") !== undefined).toBe(true);
});
