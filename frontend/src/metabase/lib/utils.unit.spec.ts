import MetabaseUtils from "metabase/lib/utils";

const { compareVersions } = MetabaseUtils;

describe("compareVersions", () => {
  it("should return 0 for equal versions", () => {
    expect(compareVersions("v0.46.0", "v0.46.0")).toBe(0);
  });

  it("should compare majors", () => {
    expect(compareVersions("v0.46.0", "v0.47.0")).toBe(-1);
    expect(compareVersions("v0.47.0", "v0.46.0")).toBe(1);
  });

  it("should compare minors", () => {
    expect(compareVersions("v0.46.0", "v0.46.1")).toBe(-1);
    expect(compareVersions("v0.46.1", "v0.46.0")).toBe(1);
  });

  it("should consider X-beta < X", () => {
    expect(compareVersions("v0.46.0-BETA", "v0.46.0")).toBe(-1);
  });

  it("should consider X-beta < X-RC", () => {
    expect(compareVersions("v0.46.0-BETA", "v0.46.0-RC")).toBe(-1);
  });

  it("should consider X-BETA1 < X-BETA2", () => {
    expect(compareVersions("v0.46.0-BETA1", "v0.46.0-BETA2")).toBe(-1);
  });

  it("should treat missing subversions as 0", () => {
    expect(compareVersions("v0.46.0", "v0.46")).toBe(0);
    expect(compareVersions("v0.46.2", "v0.46.2.0")).toBe(0);
    expect(compareVersions("v0.46", "v0.46.1")).toBe(-1);
  });

  it("should consider v0.46-BETA1 < v0.46.0", () => {
    expect(compareVersions("v0.46-BETA1 ", "v0.46.0")).toBe(-1);
  });

  it("should consider v0.46-BETA1 < v0.46.1-BETA1", () => {
    expect(compareVersions("v0.46-BETA1 ", "v0.46.1-BETA1")).toBe(-1);
  });
});
