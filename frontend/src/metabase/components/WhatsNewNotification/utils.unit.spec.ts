import { isMajorUpdate } from "./utils";

describe("What's new - utils", () => {
  describe("isMajorUpdate", () => {
    it("detects major updates correctly", () => {
      expect(isMajorUpdate("v0.15.0", "v0.14.0")).toBe(true);
      expect(isMajorUpdate("v0.15.1", "v0.14.3")).toBe(true);
      expect(isMajorUpdate("v0.15.1", "v0.14")).toBe(true);
      expect(isMajorUpdate("v0.15", "v0.14.1")).toBe(true);
      expect(isMajorUpdate("v0.17", "v0.14")).toBe(true);
    });

    it("understands minor updates", () => {
      expect(isMajorUpdate("v0.14.1", "v0.14.0")).toBe(false);
      expect(isMajorUpdate("v0.14.5", "v0.14.1")).toBe(false);
    });

    it("works without `v` prefix", () => {
      expect(isMajorUpdate("0.15.0", "0.14.0")).toBe(true);
      expect(isMajorUpdate("0.14.1", "0.14.0")).toBe(false);
    });
  });
});
