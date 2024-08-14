import { merge } from "icepick";

import type { FunnelDatum, FunnelSettings } from "../types";

import {
  calculateFunnelPolygonPoints,
  calculateFunnelSteps,
  reorderData,
} from "./funnel";

describe("calculateFunnelSteps", () => {
  it("calculates funnel steps from data", () => {
    const stepWidth = 100;
    const funnelHeight = 100;
    const steps = calculateFunnelSteps(
      [
        ["funnel step 1", 100],
        ["funnel step 2", 50],
        ["funnel step 3", 0],
      ],
      stepWidth,
      funnelHeight,
    );

    expect(steps).toStrictEqual([
      {
        height: 100,
        left: 0,
        measure: 100,
        percent: 1,
        step: "funnel step 1",
        top: 0,
      },
      {
        height: 50,
        left: 100,
        measure: 50,
        percent: 0.5,
        step: "funnel step 2",
        top: 25,
      },
      {
        height: 0,
        left: 200,
        measure: 0,
        percent: 0,
        step: "funnel step 3",
        top: 50,
      },
    ]);
  });
});

describe("calculateFunnelPolygonPoints", () => {
  it("calculates polygon points with respect to margin top", () => {
    const step = {
      top: 0,
      left: 0,
      height: 100,
    };

    const nextStep = {
      top: 0,
      left: 100,
      height: 50,
    };

    const marginTop = 100;

    expect(
      calculateFunnelPolygonPoints(step, nextStep, marginTop),
    ).toStrictEqual([
      [0, 100], // left top
      [100, 100], // right top
      [100, 150], // right bottom
      [0, 200], // left bottom
    ]);
  });
});

describe("reorderData", () => {
  const data: FunnelDatum[] = [
    ["funnel step 1", 100],
    ["funnel step 2", 50],
    ["funnel step 3", 0],
  ];

  const settings: FunnelSettings = {
    colors: {
      border: "#ffffff",
      brand: "#ffffff",
      textMedium: "#ffffff",
    },
    step: {
      name: "Step",
      format: {},
    },
    measure: {
      format: {},
    },
    visualization_settings: {},
  };

  it("should not reorder data when `funnel.rows` isn't set", () => {
    const reorderedData = reorderData(data, settings);
    expect(reorderedData).toEqual(data);
  });

  it("reorders data given `funnel.rows` is set", () => {
    const reorderedData = reorderData(
      data,
      merge(settings, {
        visualization_settings: {
          "funnel.rows": [
            { enabled: true, key: "funnel step 1", name: "funnel step 1" },
            { enabled: true, key: "funnel step 3", name: "funnel step 3" },
            { enabled: true, key: "funnel step 2", name: "funnel step 2" },
          ],
        },
      }),
    );
    expect(reorderedData).toEqual([
      ["funnel step 1", 100],
      ["funnel step 3", 0],
      ["funnel step 2", 50],
    ]);
  });

  it("reorders data for only enabled row in `funnel.rows`", () => {
    const reorderedData = reorderData(
      data,
      merge(settings, {
        visualization_settings: {
          "funnel.rows": [
            { enabled: true, key: "funnel step 1", name: "funnel step 1" },
            { enabled: true, key: "funnel step 3", name: "funnel step 3" },
            { enabled: false, key: "funnel step 2", name: "funnel step 2" },
          ],
        },
      }),
    );
    expect(reorderedData).toEqual([
      ["funnel step 1", 100],
      ["funnel step 3", 0],
    ]);
  });
});
