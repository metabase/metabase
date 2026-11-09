test.skip.each([1, 2])("skipped each %i", () => {});
describe.skip.each([1])("skipped describe each %i", () => {
  test("inside", () => {});
});
test("runs", () => {});
