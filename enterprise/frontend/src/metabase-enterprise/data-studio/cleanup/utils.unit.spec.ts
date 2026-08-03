import { getErrorStatus } from "./utils";

describe("getErrorStatus", () => {
  it("returns an API error status", () => {
    expect(getErrorStatus({ status: 409 })).toBe(409);
  });

  it("returns undefined for values without a status", () => {
    expect(getErrorStatus(new Error("failed"))).toBeUndefined();
    expect(getErrorStatus(null)).toBeUndefined();
  });
});
