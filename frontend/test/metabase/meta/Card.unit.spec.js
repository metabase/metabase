import { isStructured, isNative } from "metabase/meta/Card";

describe("metabase/meta/Card", () => {
  describe("isStructured", () => {
    it("should return true for a structured card", () => {
      expect(
        isStructured({
          dataset_query: {
            type: "query",
            query: {
              "source-table": 1,
            },
          },
        }),
      ).toBe(true);
    });

    it("should return false for a native card", () => {
      expect(
        isStructured({
          dataset_query: {
            type: "native",
            native: {
              query: "SELECT 1",
            },
          },
        }),
      ).toBe(false);
    });
  });

  describe("isNative", () => {
    it("should return true for a native card", () => {
      expect(
        isNative({
          dataset_query: {
            type: "native",
            native: {
              query: "SELECT 1",
            },
          },
        }),
      ).toBe(true);
    });

    it("should return false for a structured card", () => {
      expect(
        isNative({
          dataset_query: {
            type: "query",
            query: {
              "source-table": 1,
            },
          },
        }),
      ).toBe(false);
    });
  });
});
