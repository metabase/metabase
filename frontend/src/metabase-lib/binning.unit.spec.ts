import { createQuery, columnFinder } from "./test-helpers";
import * as ML from "./v2";

describe("binning", () => {
  describe("availableBinningStrategies", () => {
    const query = createQuery();
    const findBreakoutableColumn = columnFinder(
      query,
      ML.breakoutableColumns(query),
    );

    it("should return nothing for eg. ID columns", () => {
      expect(
        ML.availableBinningStrategies(
          query,
          findBreakoutableColumn("ORDERS", "ID"),
        ),
      ).toBe(null);
    });

    it("should return the 'N bins' options for general columns", () => {
      const strategies = ML.availableBinningStrategies(
        query,
        findBreakoutableColumn("ORDERS", "SUBTOTAL"),
      );
      expect(
        strategies.map(strat => ML.displayInfo(query, strat)?.displayName),
      ).toEqual(["Auto bin", "10 bins", "50 bins", "100 bins", "Don't bin"]);
    });

    it("should return the degrees-wide bins options for geographic columns", () => {
      const strategies = ML.availableBinningStrategies(
        query,
        findBreakoutableColumn("PEOPLE", "LONGITUDE"),
      );
      expect(
        strategies.map(strat => ML.displayInfo(query, strat)?.displayName),
      ).toEqual([
        "Auto bin",
        "Bin every 0.1 degrees",
        "Bin every 1 degree",
        "Bin every 10 degrees",
        "Bin every 20 degrees",
        "Don't bin",
      ]);
    });
  });

  describe("add binning", () => {
    const query = createQuery();
    const findBreakoutableColumn = columnFinder(
      query,
      ML.breakoutableColumns(query),
    );

    it("should handle no binning set", () => {
      expect(ML.binning(findBreakoutableColumn("ORDERS", "SUBTOTAL"))).toBe(
        null,
      );
    });

    it("should produce a binned column", () => {
      const longitude = findBreakoutableColumn("PEOPLE", "LONGITUDE");
      const strategies = ML.availableBinningStrategies(query, longitude);
      const binned = ML.withBinning(longitude, strategies[2]);
      const binning = ML.binning(binned);

      expect(binning).toBeDefined();
      expect(ML.displayName(query, binned)).toBe("Longitude: 1°");
    });
  });

  // TODO: Test attaching to queries; removing and replacing.
});
