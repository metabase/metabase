import {
  resolveAllowedCustomVisualizations,
  validateAllowedCustomVisualizations,
} from "./validate-allowed-custom-visualizations";

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe("validateAllowedCustomVisualizations", () => {
  it("keeps custom:-prefixed strings", () => {
    expect(
      validateAllowedCustomVisualizations(["custom:demo-viz", "custom:Thumbs"]),
    ).toEqual(["custom:demo-viz", "custom:Thumbs"]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("drops strings without the custom: prefix", () => {
    expect(
      validateAllowedCustomVisualizations(["custom:demo-viz", "table", "bar"]),
    ).toEqual(["custom:demo-viz"]);
  });

  it("drops non-string entries", () => {
    expect(
      validateAllowedCustomVisualizations([
        "custom:demo-viz",
        123,
        null,
        undefined,
        { name: "custom:fake" },
        ["custom:fake"],
      ]),
    ).toEqual(["custom:demo-viz"]);
  });

  it("returns an empty array for non-array input", () => {
    expect(validateAllowedCustomVisualizations(undefined)).toEqual([]);
    expect(validateAllowedCustomVisualizations(null)).toEqual([]);
    expect(validateAllowedCustomVisualizations("custom:demo-viz")).toEqual([]);
    expect(validateAllowedCustomVisualizations({})).toEqual([]);
  });

  it("returns an empty array for an empty array", () => {
    expect(validateAllowedCustomVisualizations([])).toEqual([]);
  });

  it("warns once per dropped entry, mentioning built-ins", () => {
    validateAllowedCustomVisualizations(["ThumbsWithoutPrefix"]);
    validateAllowedCustomVisualizations(["ThumbsWithoutPrefix"]);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('"ThumbsWithoutPrefix"'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Built-in visualizations are always enabled"),
    );
  });

  it("warns when the value is not an array (but not when omitted)", () => {
    validateAllowedCustomVisualizations(undefined);
    validateAllowedCustomVisualizations(null);
    expect(warnSpy).not.toHaveBeenCalled();

    validateAllowedCustomVisualizations("custom:not-an-array");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Expected an array"),
    );
  });
});

describe("resolveAllowedCustomVisualizations", () => {
  it("forces an empty allowlist for guest embeds, even when one is passed", () => {
    expect(
      resolveAllowedCustomVisualizations({
        isGuest: true,
        allowedCustomVisualizations: ["custom:demo-viz"],
      }),
    ).toEqual([]);
  });

  it("returns the validated allowlist for non-guest embeds", () => {
    expect(
      resolveAllowedCustomVisualizations({
        isGuest: false,
        allowedCustomVisualizations: ["custom:demo-viz", "not-custom"],
      }),
    ).toEqual(["custom:demo-viz"]);
  });

  it("returns an empty allowlist when settings are missing", () => {
    expect(resolveAllowedCustomVisualizations(undefined)).toEqual([]);
    expect(resolveAllowedCustomVisualizations({})).toEqual([]);
  });
});
