import {
  createMockSingleSeries,
  createMockCard,
  createMockDataset,
  createMockDatasetData,
  createMockColumn,
} from "metabase-types/api/mocks";

import {
  STACKABLE_SETTINGS,
  GRAPH_AXIS_SETTINGS,
  getDefaultDimensionLabel,
} from "./graph";

describe("STACKABLE_SETTINGS", () => {
  describe("stackable.stack_type", () => {
    describe("getDefault", () => {
      const getDefault = STACKABLE_SETTINGS["stackable.stack_type"].getDefault;

      it("should return stacked if area chart has more than 1 metric", () => {
        const value = getDefault([{ card: { display: "area" } }], {
          "graph.metrics": ["foo", "bar"],
          "graph.dimensions": [],
        });

        expect(value).toBe("stacked");
      });

      it("should return stacked if area chart has more than 1 dimension", () => {
        const value = getDefault([{ card: { display: "area" } }], {
          "graph.metrics": [],
          "graph.dimensions": ["foo", "bar"],
        });

        expect(value).toBe("stacked");
      });

      it("should return null if area chart has 1 metric and 1 dimension", () => {
        const value = getDefault([{ card: { display: "area" } }], {
          "graph.metrics": ["foo"],
          "graph.dimensions": ["bar"],
        });

        expect(value).toBeNull();
      });

      it("should return the legacy 'stackable.stacked' value if present", () => {
        const value = getDefault([{ card: { display: "area" } }], {
          "stackable.stacked": "normalized",
          "graph.metrics": ["foo", "bar"],
          "graph.dimensions": ["bar"],
        });

        expect(value).toBe("normalized");
      });
    });
  });
});

describe("getDefaultDimensionLabel", () => {
  it("should return null when no series", () => {
    const label = getDefaultDimensionLabel([]);
    expect(label).toBeNull();
  });

  it("should return the dimension label when 1 series", () => {
    const label = getDefaultDimensionLabel([
      createMockSingleSeries(
        createMockCard(),
        createMockDataset({
          data: createMockDatasetData({
            cols: [createMockColumn({ display_name: "foo" })],
          }),
        }),
      ),
    ]);
    expect(label).toBe("foo");
  });

  it("should return the first dimension label when >1 series", () => {
    const label = getDefaultDimensionLabel([
      createMockSingleSeries(
        createMockCard(),
        createMockDataset({
          data: createMockDatasetData({
            cols: [
              createMockColumn({ display_name: "foo" }),
              createMockColumn({ display_name: "bar" }),
            ],
          }),
        }),
      ),
    ]);
    expect(label).toBe("foo");
  });
});

describe("GRAPH_AXIS_SETTINGS", () => {
  describe("graph.y_axis.unpin_from_zero", () => {
    it.each([
      {
        display: "scatter",
        expectedHidden: false,
      },
      {
        display: "line",
        expectedHidden: false,
      },
      {
        display: "area",
        expectedHidden: true,
      },
      {
        display: "bar",
        expectedHidden: true,
      },
      {
        display: "combo",
        expectedHidden: false,
      },
      {
        display: "waterfall",
        expectedHidden: true,
      },
    ])(
      "should be visible on all display types except waterfall",
      ({ display, expectedHidden }) => {
        const isHidden = GRAPH_AXIS_SETTINGS[
          "graph.y_axis.unpin_from_zero"
        ].getHidden([{ card: { display } }], {
          "graph.metrics": ["foo"],
          "graph.dimensions": ["bar"],
          "graph.y_axis.auto_range": true,
          series: () => ({ display }),
        });
        expect(isHidden).toBe(expectedHidden);
      },
    );

    it("should be hidden when auto_range is disabled", () => {
      const isHidden = GRAPH_AXIS_SETTINGS[
        "graph.y_axis.unpin_from_zero"
      ].getHidden([{ card: { display: "line" } }], {
        "graph.metrics": ["foo"],
        "graph.dimensions": ["bar"],
        "graph.y_axis.auto_range": false,
        series: () => ({ display: "line" }),
      });
      expect(isHidden).toBe(true);
    });

    it("should be hidden when line visualization has overriding series display settings", () => {
      const isHidden = GRAPH_AXIS_SETTINGS[
        "graph.y_axis.unpin_from_zero"
      ].getHidden([{ card: { display: "line" } }], {
        "graph.metrics": ["foo"],
        "graph.dimensions": ["bar"],
        "graph.y_axis.auto_range": false,
        series: () => ({ display: "bar" }),
      });
      expect(isHidden).toBe(true);
    });

    it.each([
      {
        display: "scatter",
        expectedDefault: true,
      },
      {
        display: "line",
        expectedDefault: false,
      },
      {
        display: "bar",
        expectedDefault: false,
      },
      {
        display: "combo",
        expectedDefault: false,
      },
    ])(
      "should be enabled by default on scatter charts",
      ({ display, expectedDefault }) => {
        const isEnabled = GRAPH_AXIS_SETTINGS[
          "graph.y_axis.unpin_from_zero"
        ].getDefault([{ card: { display } }], {
          "graph.metrics": ["foo"],
          "graph.dimensions": ["bar"],
          "graph.y_axis.auto_range": true,
          series: () => ({ display }),
        });
        expect(isEnabled).toBe(expectedDefault);
      },
    );
  });
});
