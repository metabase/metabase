import {
  versionToNumericComponents,
  compareVersions,
  isEmpty,
  isJWT,
} from "./utils";

describe("utils", () => {
  describe("versionToNumericComponents", () => {
    it("should understand v1 and use defaults for the rest of fields", () => {
      expect(versionToNumericComponents("v1")).toStrictEqual([
        1, 0, 0, 0, 0, 0,
      ]);
    });

    it("should pad to 4 numeric components", () => {
      expect(versionToNumericComponents("v1.2-BETA1")).toStrictEqual([
        1, 2, 0, 0, -2, 1,
      ]);
    });

    it("should return null when the version is not parsable", () => {
      expect(versionToNumericComponents("vUNKNOWN")).toEqual(null);
    });
  });

  describe("compareVersions", () => {
    it("should sort an array of versions when passed to `.sort`", () => {
      const expected = [
        "0.0.9",
        "0.0.10-snapshot",
        "0.0.10-alpha1",
        "0.0.10-rc1",
        "0.0.10-rc2",
        "0.0.10-rc10",
        "0.0.10",
        "0.1.0",
        "0.2.0",
        "0.10.0",
        "1.1.0",
      ];

      const unsorted = [
        "0.0.10-rc10",
        "0.0.10",
        "0.0.10-alpha1",
        "0.0.10-snapshot",
        "0.0.9",
        "0.1.0",
        "0.0.10-rc1",
        "0.0.10-rc2",
        "0.10.0",
        "1.1.0",
        "0.2.0",
      ];
      expect(unsorted.sort(compareVersions)).toEqual(expected);
    });

    it("should return null if one version is not valid", () => {
      expect(compareVersions("vUNKNOWN", "v0.46.0")).toBe(null);
    });

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

    it("should consider X.BETA and X.0-BETA equal", () => {
      expect(compareVersions("v0.46.0-BETA", "v0.46-BETA")).toBe(0);
    });

    it("should treat missing subversions as 0", () => {
      expect(compareVersions("v0.46.0", "v0.46")).toBe(0);
      expect(compareVersions("v0.46.2", "v0.46.2.0")).toBe(0);
      expect(compareVersions("v0.46", "v0.46.1")).toBe(-1);
    });

    it("should consider v0.46-BETA1 < v0.46.0", () => {
      expect(compareVersions("v0.46-BETA1", "v0.46.0")).toBe(-1);
    });

    it("should consider v0.46-BETA1 < v0.46.1-BETA1", () => {
      expect(compareVersions("v0.46-BETA1", "v0.46.1-BETA1")).toBe(-1);
    });
  });

  describe("isEmpty", () => {
    it("should not allow all-blank strings", () => {
      expect(isEmpty(" ")).toEqual(true);
    });
  });

  describe("isJWT", () => {
    it("should allow for JWT tokens with dashes", () => {
      expect(
        isJWT(
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwYXJhbXMiOnsicGFyYW0xIjoidGVzdCIsInBhcmFtMiI6ImFiIiwicGFyYW0zIjoiMjAwMC0wMC0wMFQwMDowMDowMCswMDowMCIsInBhcmFtNCI6Iu-8iO-8iSJ9LCJyZXNvdXJjZSI6eyJkYXNoYm9hcmQiOjB9fQ.wsNWliHJNwJBv_hx0sPo1EGY0nATdgEa31TM1AYotIA",
        ),
      ).toEqual(true);
    });
  });
});
