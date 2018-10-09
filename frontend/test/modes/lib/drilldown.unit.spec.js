/* eslint-disable flowtype/require-valid-file-annotation */

import {
  metadata,
  ORDERS_CREATED_DATE_FIELD_ID,
  ORDERS_TOTAL_FIELD_ID,
  PEOPLE_LATITUDE_FIELD_ID,
  PEOPLE_LONGITUDE_FIELD_ID,
  PEOPLE_STATE_FIELD_ID,
} from "__support__/sample_dataset_fixture";

import { drillDownForDimensions } from "../../../src/metabase/qb/lib/drilldown";

const col = (fieldId, extra = {}) => ({
  ...metadata.fields[fieldId],
  ...extra,
});

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
            column: col(ORDERS_CREATED_DATE_FIELD_ID, {
              unit: "year",
            }),
          },
        ],
        metadata,
      );
      expect(drillDown).toEqual({
        breakouts: [
          [
            "datetime-field",
            ["field-id", ORDERS_CREATED_DATE_FIELD_ID],
            "quarter",
          ],
        ],
      });
    });
    it("should return breakout by minute for breakout by hour", () => {
      const drillDown = drillDownForDimensions(
        [
          {
            column: col(ORDERS_CREATED_DATE_FIELD_ID, {
              unit: "hour",
            }),
          },
        ],
        metadata,
      );
      expect(drillDown).toEqual({
        breakouts: [
          [
            "datetime-field",
            ["field-id", ORDERS_CREATED_DATE_FIELD_ID],
            "minute",
          ],
        ],
      });
    });
    it("should return null for breakout by minute", () => {
      const drillDown = drillDownForDimensions(
        [
          {
            column: col(ORDERS_CREATED_DATE_FIELD_ID, {
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
            column: col(ORDERS_TOTAL_FIELD_ID, {
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
          ["binning-strategy", ["field-id", ORDERS_TOTAL_FIELD_ID], "default"],
        ],
      });
    });

    it("should return breakout with bin-width of 1 for bin-width of 10", () => {
      const drillDown = drillDownForDimensions(
        [
          {
            column: col(ORDERS_TOTAL_FIELD_ID, {
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
            "binning-strategy",
            ["field-id", ORDERS_TOTAL_FIELD_ID],
            "bin-width",
            1,
          ],
        ],
      });
    });

    // GEO:
    it("should return breakout by lat/lon for breakout by state", () => {
      const drillDown = drillDownForDimensions(
        [{ column: col(PEOPLE_STATE_FIELD_ID) }],
        metadata,
      );
      expect(drillDown).toEqual({
        breakouts: [
          [
            "binning-strategy",
            ["field-id", PEOPLE_LATITUDE_FIELD_ID],
            "bin-width",
            1,
          ],
          [
            "binning-strategy",
            ["field-id", PEOPLE_LONGITUDE_FIELD_ID],
            "bin-width",
            1,
          ],
        ],
      });
    });
    it("should return breakout with 10 degree bin-width for lat/lon breakout with 30 degree bin-width", () => {
      const drillDown = drillDownForDimensions(
        [
          {
            column: col(PEOPLE_LATITUDE_FIELD_ID, {
              binning_info: {
                binning_strategy: "bin-width",
                bin_width: 30,
              },
            }),
          },
          {
            column: col(PEOPLE_LONGITUDE_FIELD_ID, {
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
            "binning-strategy",
            ["field-id", PEOPLE_LATITUDE_FIELD_ID],
            "bin-width",
            10,
          ],
          [
            "binning-strategy",
            ["field-id", PEOPLE_LONGITUDE_FIELD_ID],
            "bin-width",
            10,
          ],
        ],
      });
    });

    // it("should return breakout by state for breakout by country", () => {
    //     const drillDown = drillDownForDimensions([
    //         { column: col(PEOPLE_STATE_FIELD_ID) }
    //     ], metadata);
    //     expect(drillDown).toEqual({ breakouts: [
    //         ["binning-strategy", ["field-id", PEOPLE_LATITUDE_FIELD_ID], "bin-width", 1],
    //         ["binning-strategy", ["field-id", PEOPLE_LONGITUDE_FIELD_ID], "bin-width", 1],
    //     ]});
    // })
  });
});
