import { getSubmitError } from "./utils";

describe("getSubmitError", () => {
  it("nests API field errors under details", () => {
    const error = { status: 400, data: { errors: { host: "Required" } } };
    expect(getSubmitError(error)).toEqual({
      status: 400,
      data: { errors: { details: { host: "Required" } } },
    });
  });

  it("does not mutate the original error", () => {
    const error = { data: { errors: { host: "Required" } } };
    getSubmitError(error);
    expect(error).toEqual({ data: { errors: { host: "Required" } } });
  });

  it("passes through errors without a data body", () => {
    const error = { status: 500, message: "Network error" };
    expect(getSubmitError(error)).toBe(error);
  });

  it("passes through errors with a plain-text data body", () => {
    const error = { status: 502, data: "Bad Gateway" };
    expect(getSubmitError(error)).toBe(error);
  });

  it("passes through non-object errors", () => {
    expect(getSubmitError("boom")).toBe("boom");
    expect(getSubmitError(undefined)).toBeUndefined();
  });
});
