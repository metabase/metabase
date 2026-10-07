import {
  MinRowsError,
  getDatasetError,
  getDatasetRequestFailure,
  getGenericErrorMessage,
  getPermissionErrorMessage,
} from "./errors";

describe("MinRowsError", () => {
  it("should be an instanceof Error", () => {
    expect(new MinRowsError(0) instanceof Error).toBe(true);
  });

  it("should be an instanceof MinRowsError", () => {
    expect(new MinRowsError(0) instanceof MinRowsError).toBe(true);
  });
});

describe("getDatasetError", () => {
  it("returns undefined when there is no error", () => {
    expect(getDatasetError({ error: undefined })).toBeUndefined();
  });

  it("returns a permission error for missing-required-permissions", () => {
    expect(
      getDatasetError({
        error: "nope",
        error_type: "missing-required-permissions",
      }),
    ).toEqual({ message: getPermissionErrorMessage(), icon: "key" });
  });

  it("returns a permission error for a 403 status", () => {
    expect(getDatasetError({ error: { status: 403 } })).toEqual({
      message: getPermissionErrorMessage(),
      icon: "key",
    });
  });

  it("surfaces a curated error string verbatim", () => {
    expect(
      getDatasetError({
        error: "Column FOO does not exist",
        error_is_curated: true,
      }),
    ).toEqual({ message: "Column FOO does not exist", icon: "warning" });
  });

  it("falls back to the generic message for non-curated errors", () => {
    expect(getDatasetError({ error: "boom" })).toEqual({
      message: getGenericErrorMessage(),
      icon: "warning",
    });
  });
});

describe("getDatasetRequestFailure", () => {
  it("reads the query error from a 4xx body", () => {
    expect(
      getDatasetRequestFailure({
        status: 400,
        data: {
          status: "failed",
          error: "Column FOO does not exist",
          error_type: "invalid-query",
          error_is_curated: true,
        },
      }),
    ).toEqual({
      error: "Column FOO does not exist",
      error_type: "invalid-query",
      error_is_curated: true,
    });
  });

  it("keeps the status of a 403 so it reads as a permission error", () => {
    const failure = getDatasetRequestFailure({
      status: 403,
      data: { error: "You do not have permissions to run this query." },
    });
    expect(failure && getDatasetError(failure)).toEqual({
      message: getPermissionErrorMessage(),
      icon: "key",
    });
  });

  it("keeps the status of a response without a query error", () => {
    expect(
      getDatasetRequestFailure({ status: 504, data: "<html>Timeout</html>" }),
    ).toEqual({ error: { status: 504, data: "<html>Timeout</html>" } });
  });

  it("returns undefined when there was no HTTP response", () => {
    expect(
      getDatasetRequestFailure({
        status: "FETCH_ERROR",
        error: "TypeError: Failed to fetch",
      }),
    ).toBeUndefined();
  });
});
