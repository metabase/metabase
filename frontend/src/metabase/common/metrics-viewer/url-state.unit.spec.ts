import * as Urls from "metabase/urls";
import { utf8_to_b64url } from "metabase/utils/encoding";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks";

import { decodeState, exploreMetricDimensionUrl } from "./url-state";

describe("decodeState date filters", () => {
  it.each([
    { values: ["not-a-date"] },
    { values: ["Invalid Date"] },
    { values: [null] },
    { values: [17] },
    { values: [{}] },
    { values: ["2024-01-01T00:00:00Z", "not-a-date"] },
    { values: null },
    { values: "not-a-date" },
    { values: undefined },
  ])(
    "drops only unreadable specific-date filters with values $values",
    ({ values }) => {
      const invalidFilter = {
        d: "created_at",
        v: { type: "specific-date", operator: "=", values, hasTime: false },
      };
      const validFilter = {
        d: "created_at",
        v: {
          type: "specific-date",
          operator: "=",
          values: ["2024-01-01T00:00:00Z"],
          hasTime: false,
        },
      };
      const otherFilter = {
        d: "category",
        v: { type: "string", operator: "=", values: ["Widget"], options: {} },
      };
      const filters = [invalidFilter, validFilter, otherFilter];
      const state = decodeState(
        utf8_to_b64url(
          JSON.stringify({
            f: [
              {
                t: "metric",
                i: 42,
                b: "created_at",
                u: "month",
                F: filters,
                s: [7],
              },
              { t: "measure", i: 43, F: filters },
              {
                t: "expression",
                i: "expression:test",
                n: "Revenue + 2",
                T: [
                  { t: "metric", s: "metric:42", F: filters, S: [8] },
                  { t: "operator", o: "+" },
                  { t: "constant", v: 2 },
                ],
              },
            ],
            t: [
              {
                i: "time",
                t: "time",
                l: "By Month",
                d: "bar",
                D: [{ i: 0, d: "created_at" }],
                p: { f: invalidFilter.v, u: "month", b: "10 bins" },
              },
              {
                i: "valid-time",
                t: "time",
                l: "Valid date",
                d: "line",
                D: [],
                p: { f: validFilter.v },
              },
            ],
            a: "time",
            c: true,
          }),
        ),
      );
      const revivedFilters = [
        {
          dimensionId: "created_at",
          value: {
            ...validFilter.v,
            values: [new Date("2024-01-01T00:00:00Z")],
          },
        },
        { dimensionId: "category", value: otherFilter.v },
      ];
      expect(state.formulaEntities).toEqual([
        {
          type: "metric",
          id: 42,
          breakout: "created_at",
          breakoutTemporalUnit: "month",
          filters: revivedFilters,
          segments: [7],
        },
        { type: "measure", id: 43, filters: revivedFilters },
        {
          type: "expression",
          id: "expression:test",
          name: "Revenue + 2",
          tokens: [
            {
              type: "metric",
              sourceId: "metric:42",
              filters: revivedFilters,
              segments: [8],
            },
            { type: "operator", op: "+" },
            { type: "constant", value: 2 },
          ],
        },
      ]);
      expect(state.dimensionBreakouts).toEqual([
        {
          id: "time",
          type: "time",
          label: "By Month",
          display: "bar",
          definitions: [{ slotIndex: 0, dimensionId: "created_at" }],
          projectionConfig: { temporalUnit: "month", binning: "10 bins" },
        },
        {
          id: "valid-time",
          type: "time",
          label: "Valid date",
          display: "line",
          definitions: [],
          projectionConfig: { dimensionFilter: revivedFilters[0].value },
        },
      ]);
      expect(state.dimensionBreakouts[0].projectionConfig).not.toHaveProperty(
        "dimensionFilter",
      );
      expect(state.selectedDimensionBreakoutId).toBe("time");
      expect(state.showColumnLabels).toBe(true);
    },
  );
});

describe("exploreMetricDimensionUrl", () => {
  const metric = createMockMetric({ id: 42 });
  const dimension = createMockMetricDimension({
    id: "created_at",
    display_name: "Created At",
  });

  it("should encode the metric and its dimension breakout into the metrics viewer URL", () => {
    const url = exploreMetricDimensionUrl({
      metricId: metric.id,
      dimensionId: dimension.id,
      dimensionType: "time",
      displayType: "line",
      label: dimension.display_name,
    });

    const [path, hash] = url.split("#");
    expect(path).toBe(Urls.metricsViewer());
    expect(decodeState(hash)).toEqual({
      formulaEntities: [{ type: "metric", id: metric.id }],
      dimensionBreakouts: [
        {
          id: dimension.id,
          type: "time",
          label: dimension.display_name,
          display: "line",
          definitions: [{ slotIndex: 0, dimensionId: dimension.id }],
        },
      ],
      selectedDimensionBreakoutId: dimension.id,
    });
  });
});
