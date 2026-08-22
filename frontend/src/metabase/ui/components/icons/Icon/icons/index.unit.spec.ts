import type { IconName } from "metabase-types/api";

import { isValidIconName } from "./index";

describe("isValidIconName", () => {
  it("returns true for known icon names", () => {
    expect(isValidIconName("add")).toBe(true);
    expect(isValidIconName("join_full_outer")).toBe(true);
  });

  it("returns false for unknown icon names", () => {
    expect(isValidIconName("definitely_not_an_icon")).toBe(false);
    expect(isValidIconName("")).toBe(false);
  });

  it("returns false for non-string values", () => {
    expect(isValidIconName(undefined)).toBe(false);
    expect(isValidIconName(null)).toBe(false);
    expect(isValidIconName(42)).toBe(false);
    expect(isValidIconName({})).toBe(false);
    expect(isValidIconName(["add"])).toBe(false);
  });

  it("narrows the value to IconName", () => {
    const value: unknown = "add";
    // This only type-checks if the guard narrows `value` to IconName in the true branch.
    const narrowed: IconName | undefined = isValidIconName(value)
      ? value
      : undefined;
    expect(narrowed).toBe("add");
  });
});
