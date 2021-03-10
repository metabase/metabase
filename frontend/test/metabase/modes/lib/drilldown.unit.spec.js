import { metadata, ORDERS, PEOPLE } from "__support__/sample_dataset_fixture";

import { drillDownForDimensions } from "metabase/modes/lib/drilldown";

describe("drilldown", () => {
  describe("drillDownForDimensions", () => {
    it("should return null if there are no dimensions", () => {
      const drillDown = drillDownForDimensions([], metadata);
      expect(drillDown).toEqual(null);
    });

    // DATE/TIME:
    it("should return breakout by quarter for breakout by year", () => {
      const drillDown = drillDownForDimensions(
        [
          {
            column: ORDERS.CREATED_AT.column({ unit: "year" }),
          },
        ],
        metadata,
      );
      expect(drillDown).toEqual({
        breakouts: [
          ["field", ORDERS.CREATED_AT.id, { "temporal-unit": "quarter" }],
        ],
      });
    });
    it("should return breakout by minute for breakout by hour", () => {
      const drillDown = drillDownForDimensions(
        [
          {
            column: ORDERS.CREATED_AT.column({ unit: "hour" }),
          },
        ],
        metadata,
      );
      expect(drillDown).toEqual({
        breakouts: [
          ["field", ORDERS.CREATED_AT.id, { "temporal-unit": "minute" }],
        ],
      });
    });
    it("should return null for breakout by minute", () => {
      const drillDown = drillDownForDimensions(
        [
          {
            column: ORDERS.CREATED_AT.column({
              unit: "minute",
            }),
          },
        ],
        metadata,
      );
      expect(drillDown).toEqual(null);
    });

    // NUMERIC:
    it("should reset breakout to default binning for num-bins strategy", () => {
      const drillDown = drillDownForDimensions(
        [
          {
            column: ORDERS.TOTAL.column({
              binning_info: {
                binning_strategy: "num-bins",
                num_bins: 10,
              },
            }),
          },
        ],
        metadata,
      );
      expect(drillDown).toEqual({
        breakouts: [
          ["field", ORDERS.TOTAL.id, { binning: { strategy: "default" } }],
        ],
      });
    });

    it("should return breakout with bin-width of 1 for bin-width of 10", () => {
      const drillDown = drillDownForDimensions(
        [
          {
            column: ORDERS.TOTAL.column({
              binning_info: {
                binning_strategy: "bin-width",
                bin_width: 10,
              },
            }),
          },
        ],
        metadata,
      );
      expect(drillDown).toEqual({
        breakouts: [
          [
            "field",
            ORDERS.TOTAL.id,
            { binning: { strategy: "bin-width", "bin-width": 1 } },
          ],
        ],
      });
    });

    // GEO:
    it("should return breakout by lat/lon for breakout by state", () => {
      const drillDown = drillDownForDimensions(
        [{ column: PEOPLE.STATE.column() }],
        metadata,
      );
      expect(drillDown).toEqual({
        breakouts: [
          [
            "field",
            PEOPLE.LATITUDE.id,
            { binning: { strategy: "bin-width", "bin-width": 1 } },
          ],
          [
            "field",
            PEOPLE.LONGITUDE.id,
            { binning: { strategy: "bin-width", "bin-width": 1 } },
          ],
        ],
      });
    });
    it("should return breakout with 10 degree bin-width for lat/lon breakout with 30 degree bin-width", () => {
      const drillDown = drillDownForDimensions(
        [
          {
            column: PEOPLE.LATITUDE.column({
              binning_info: {
                binning_strategy: "bin-width",
                bin_width: 30,
              },
            }),
          },
          {
            column: PEOPLE.LONGITUDE.column({
              binning_info: {
                binning_strategy: "bin-width",
                bin_width: 30,
              },
            }),
          },
        ],
        metadata,
      );
      expect(drillDown).toEqual({
        breakouts: [
          [
            "field",
            PEOPLE.LATITUDE.id,
            { binning: { strategy: "bin-width", "bin-width": 10 } },
          ],
          [
            "field",
            PEOPLE.LONGITUDE.id,
            { binning: { strategy: "bin-width", "bin-width": 10 } },
          ],
        ],
      });
    });

    // it("should return breakout by state for breakout by country", () => {
    //   const drillDown = drillDownForDimensions([
    //     { column: col(PEOPLE.STATE.id) }
    //   ], metadata);
    //   expect(drillDown).toEqual({ breakouts: [
    //     ["field", PEOPLE.LATITUDE.id, {"binning": {"strategy": "bin-width", "bin-width": 1}}],
    //     ["field", PEOPLE.LONGITUDE.id, {"binning": {"strategy": "bin-width", "bin-width": 1}}]
    //   ]});
    // });
  });
});
