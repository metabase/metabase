import { getFilterChangeDescription } from "./utils";

describe("getFilterChangeDescription", () => {
  describe("single filter changes", () => {
    it("should describe a single filter added", () => {
      const current = {};
      const draft = { filter1: "value1" };

      expect(getFilterChangeDescription(current, draft)).toBe(
        "1 filter changed",
      );
    });

    it("should describe a single filter removed", () => {
      const current = { filter1: "value1" };
      const draft = {};

      expect(getFilterChangeDescription(current, draft)).toBe(
        "1 filter changed",
      );
    });

    it("should describe a single filter updated", () => {
      const current = { filter1: "value1" };
      const draft = { filter1: "value2" };

      expect(getFilterChangeDescription(current, draft)).toBe(
        "1 filter changed",
      );
    });
  });

  describe("multiple filter changes", () => {
    it("should describe multiple filters added", () => {
      const current = {};
      const draft = { filter1: "value1", filter2: "value2" };

      expect(getFilterChangeDescription(current, draft)).toBe(
        "2 filters changed",
      );
    });

    it("should describe multiple filters removed", () => {
      const current = { filter1: "value1", filter2: "value2" };
      const draft = {};

      expect(getFilterChangeDescription(current, draft)).toBe(
        "2 filters changed",
      );
    });

    it("should describe multiple filters updated", () => {
      const current = { filter1: "value1", filter2: "value2" };
      const draft = { filter1: "newValue1", filter2: "newValue2" };

      expect(getFilterChangeDescription(current, draft)).toBe(
        "2 filters changed",
      );
    });
  });

  describe("mixed filter changes", () => {
    it("should describe added and updated filters", () => {
      const current = { filter1: "value1" };
      const draft = { filter1: "newValue1", filter2: "value2" };

      expect(getFilterChangeDescription(current, draft)).toBe(
        "2 filters changed",
      );
    });

    it("should describe added and removed filters", () => {
      const current = { filter1: "value1" };
      const draft = { filter2: "value2" };

      expect(getFilterChangeDescription(current, draft)).toBe(
        "2 filters changed",
      );
    });

    it("should describe updated and removed filters", () => {
      const current = { filter1: "value1", filter2: "value2" };
      const draft = { filter1: "newValue1" };

      expect(getFilterChangeDescription(current, draft)).toBe(
        "2 filters changed",
      );
    });

    it("should describe all three types of changes", () => {
      const current = { filter1: "value1", filter2: "value2" };
      const draft = { filter1: "newValue1", filter3: "value3" };

      expect(getFilterChangeDescription(current, draft)).toBe(
        "3 filters changed",
      );
    });
  });

  describe("empty values handling", () => {
    it("should treat null as empty", () => {
      const current = { filter1: null };
      const draft = { filter1: "value1" };

      expect(getFilterChangeDescription(current, draft)).toBe(
        "1 filter changed",
      );
    });

    it("should treat undefined as empty", () => {
      const current = { filter1: undefined };
      const draft = { filter1: "value1" };

      expect(getFilterChangeDescription(current, draft)).toBe(
        "1 filter changed",
      );
    });

    it("should treat empty array as empty", () => {
      const current = { filter1: [] };
      const draft = { filter1: ["value1"] };

      expect(getFilterChangeDescription(current, draft)).toBe(
        "1 filter changed",
      );
    });

    it("should not treat non-empty array as empty", () => {
      const current = { filter1: ["value1"] };
      const draft = { filter1: ["value2"] };

      expect(getFilterChangeDescription(current, draft)).toBe(
        "1 filter changed",
      );
    });

    it("should handle transition from value to empty", () => {
      const current = { filter1: "value1" };
      const draft = { filter1: null };

      expect(getFilterChangeDescription(current, draft)).toBe(
        "1 filter changed",
      );
    });

    it("should handle transition from value to empty array", () => {
      const current = { filter1: "value1" };
      const draft = { filter1: [] };

      expect(getFilterChangeDescription(current, draft)).toBe(
        "1 filter changed",
      );
    });
  });

  describe("array value comparisons", () => {
    it("should detect array value changes", () => {
      const current = { filter1: ["a", "b"] };
      const draft = { filter1: ["a", "c"] };

      expect(getFilterChangeDescription(current, draft)).toBe(
        "1 filter changed",
      );
    });

    it("should detect array order changes", () => {
      const current = { filter1: ["a", "b"] };
      const draft = { filter1: ["b", "a"] };

      expect(getFilterChangeDescription(current, draft)).toBe(
        "1 filter changed",
      );
    });

    it("should not detect changes when arrays are identical", () => {
      const current = { filter1: ["a", "b"] };
      const draft = { filter1: ["a", "b"] };

      expect(getFilterChangeDescription(current, draft)).toBe("");
    });
  });

  describe("object value comparisons", () => {
    it("should detect object value changes", () => {
      const current = { filter1: { key: "value1" } };
      const draft = { filter1: { key: "value2" } };

      expect(getFilterChangeDescription(current, draft)).toBe(
        "1 filter changed",
      );
    });

    it("should not detect changes when objects are identical", () => {
      const current = { filter1: { key: "value" } };
      const draft = { filter1: { key: "value" } };

      expect(getFilterChangeDescription(current, draft)).toBe("");
    });
  });

  describe("edge cases", () => {
    it("should return empty string when no changes", () => {
      const current = { filter1: "value1" };
      const draft = { filter1: "value1" };

      expect(getFilterChangeDescription(current, draft)).toBe("");
    });

    it("should handle empty objects", () => {
      const current = {};
      const draft = {};

      expect(getFilterChangeDescription(current, draft)).toBe("");
    });

    it("should handle filters with same key but both empty values", () => {
      const current = { filter1: null };
      const draft = { filter1: [] };

      expect(getFilterChangeDescription(current, draft)).toBe("");
    });

    it("should handle complex mixed scenario", () => {
      const current = {
        filter1: "value1", // will be updated
        filter2: ["a", "b"], // will be removed
        filter3: null, // will be added
        filter4: "unchanged", // no change
        filter5: [], // will be added
      };
      const draft = {
        filter1: "newValue1", // updated
        filter3: "value3", // added
        filter4: "unchanged", // no change
        filter5: ["item"], // added
        filter6: { key: "val" }, // added
      };

      expect(getFilterChangeDescription(current, draft)).toBe(
        "5 filters changed",
      );
    });
  });
});
