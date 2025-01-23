import { ResolverError } from "./pratt/types";
import { resolve } from "./resolver";

describe("resolver", () => {
  describe("type compatibility", () => {
    it("should allow aggregation in numeric operations", () => {
      const expression = ["+", ["metric", "Total Sales"], 100];
      expect(() => {
        resolve({ expression, type: "number" });
      }).not.toThrow();
    });

    it("should allow numbers in aggregation operations", () => {
      const expression = ["+", ["metric", "Total Sales"], 100];
      expect(() => {
        resolve({ expression, type: "aggregation" });
      }).not.toThrow();
    });

    it("should handle case expressions with aggregations", () => {
      const expression = [
        "case",
        [
          [[">", ["metric", "Total Sales"], 1000], 100],
          [["<=", ["metric", "Total Sales"], 1000], 50],
        ],
      ];
      expect(() => {
        resolve({ expression, type: "number" });
      }).not.toThrow();
    });

    it("should handle case expressions with direct aggregation comparisons", () => {
      const expression = [
        "case",
        [
          [[">", ["sum", ["field", "Latitude", null]], 10], 10],
          [
            ["<=", ["sum", ["field", "Latitude", null]], 10],
            ["sum", ["field", "Latitude", null]],
          ],
        ],
      ];
      expect(() => {
        resolve({ expression, type: "number" });
      }).not.toThrow();
    });

    it("should throw error for incompatible types", () => {
      const expression = ["+", ["dimension", "Category"], 100];
      expect(() => {
        resolve({ expression, type: "number" });
      }).toThrow(ResolverError);
    });
  });
});
