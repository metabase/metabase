import { MinRowsError } from "metabase/visualizations/lib/errors";

describe("MinRowsError", () => {
  it("should be an instanceof Error", () => {
    expect(new MinRowsError(1, 0) instanceof Error).toBe(true);
  });
  it("should be an instanceof MinRowsError", () => {
    expect(new MinRowsError(1, 0) instanceof MinRowsError).toBe(true);
  });
});
