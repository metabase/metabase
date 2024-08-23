import type { CoreLoadingProps } from "./types";
import { getErrorAndLoading, or } from "./utils";

describe("getErrorAndLoading", () => {
  it("returns [false, false] by default", () => {
    const [error, loading] = getErrorAndLoading({});
    expect(error).toBe(false);
    expect(loading).toBe(false);
  });

  it("extracts error and loading fields from props", () => {
    const props: CoreLoadingProps = { error: false, loading: true };
    const [error, loading] = getErrorAndLoading(props);
    expect(error).toBe(false);
    expect(loading).toBe(true);
  });

  it("handles loading array with values true and false", () => {
    const props: CoreLoadingProps = {
      error: false,
      loading: [true, false],
    };
    const [error, loading] = getErrorAndLoading(props);
    expect(error).toBe(false);
    expect(loading).toBe(true);
  });

  it("handles loading array with values false and false", () => {
    const props: CoreLoadingProps = {
      error: true,
      loading: [false, false],
    };
    const [error, loading] = getErrorAndLoading(props);
    expect(error).toBe(true);
    expect(loading).toBe(false);
  });

  it("handles error array with one truthy value", () => {
    const props: CoreLoadingProps = {
      error: [false, { message: "Error!" }],
      loading: [false, false],
    };
    const [error, loading] = getErrorAndLoading(props);
    expect(error).toEqual({ message: "Error!" });
    expect(loading).toBe(false);
  });

  it("handles error array with no truthy values", () => {
    const props: CoreLoadingProps = {
      error: [false, null, undefined],
      loading: [true, true],
    };
    const [error, loading] = getErrorAndLoading(props);
    expect(error).toEqual(false);
    expect(loading).toBe(true);
  });
});

describe("or", () => {
  it("returns the single truthy value if the input is a non-array truthy value", () => {
    expect(or(42)).toBe(42);
  });

  it("returns false if the input is a non-array falsy value", () => {
    expect(or(0)).toBe(false);
  });

  it("returns the first truthy value from an array of mixed values", () => {
    expect(or([0, null, undefined, false, 5, true])).toBe(5);
  });

  it("returns false if all elements in an array are falsy", () => {
    expect(or([0, null, undefined, false, ""])).toBe(false);
  });

  it("works with an empty array", () => {
    expect(or([])).toBe(false);
  });

  it("returns the truthy value from an array with one truthy item", () => {
    expect(or([true])).toBe(true);
  });

  it("returns the single falsy value if the array has only one falsy item", () => {
    expect(or([0])).toBe(false);
  });
});
