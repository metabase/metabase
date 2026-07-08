import {
  MinRowsError,
  getDatasetError,
  getGenericErrorMessage,
  getPermissionErrorMessage,
} from "metabase/visualizations/lib/errors";

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
