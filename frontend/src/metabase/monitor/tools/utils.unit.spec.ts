import { toBackendStartedAt } from "./utils";

describe("toBackendStartedAt", () => {
  it("returns undefined when no range is selected", () => {
    expect(toBackendStartedAt(null, false)).toBeUndefined();
    expect(toBackendStartedAt(null, true)).toBeUndefined();
  });

  it("appends the ~ suffix for past* ranges when today is included", () => {
    expect(toBackendStartedAt("past7days", true)).toBe("past7days~");
    expect(toBackendStartedAt("past1weeks", true)).toBe("past1weeks~");
    expect(toBackendStartedAt("past12months", true)).toBe("past12months~");
  });

  it("does not append the ~ suffix for past* ranges when today is excluded", () => {
    expect(toBackendStartedAt("past7days", false)).toBe("past7days");
  });

  it("never appends the ~ suffix for this* ranges (backend rejects thisday~)", () => {
    expect(toBackendStartedAt("thisday", true)).toBe("thisday");
    expect(toBackendStartedAt("thisday", false)).toBe("thisday");
  });
});
