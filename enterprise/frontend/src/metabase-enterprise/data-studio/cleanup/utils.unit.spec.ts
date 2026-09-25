import { getErrorStatus, isStaleCandidateError } from "./utils";

describe("getErrorStatus", () => {
  it("returns an API error status", () => {
    expect(getErrorStatus({ status: 409 })).toBe(409);
  });

  it("returns undefined for values without a status", () => {
    expect(getErrorStatus(new Error("failed"))).toBeUndefined();
    expect(getErrorStatus(null)).toBeUndefined();
  });
});

describe("isStaleCandidateError", () => {
  it.each([409, 404])("treats a %d response as a stale candidate", (status) => {
    expect(isStaleCandidateError({ status })).toBe(true);
  });

  it("does not treat other statuses as a stale candidate", () => {
    expect(isStaleCandidateError({ status: 500 })).toBe(false);
    expect(isStaleCandidateError(new Error("failed"))).toBe(false);
  });
});
