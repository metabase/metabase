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
  GRAPH_DISPLAY_VALUES_SETTINGS,
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

    describe("isValid", () => {
      const isValid = STACKABLE_SETTINGS["stackable.stack_type"].isValid;

      it("should be valid even on cards with display=line when there are stackable series (metabase#45182)", () => {
        const result = isValid(
          [
            { card: { display: "line" }, id: 1 },
            { card: { display: "line" }, id: 2 },
            { card: { display: "line" }, id: 3 },
          ],
          {
            series: series => ({
              display: series.card.id === 1 ? "line" : "bar",
            }),
            "stackable.stack_type": "stacked",
            "graph.show_values": false,
          },
        );

        expect(result).toBe(true);
      });

      it("should not be valid when there is less than two stackable series", () => {
        const result = isValid(
          [
            { card: { display: "bar" }, id: 1 },
            { card: { display: "bar" }, id: 2 },
            { card: { display: "bar" }, id: 3 },
          ],
          {
            series: series => ({
              display: series.card.id === 1 ? "bar" : "line",
            }),
            "stackable.stack_type": "stacked",
            "graph.show_values": false,
          },
        );

        expect(result).toBe(false);
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

describe("GRAPH_DISPLAY_VALUES_SETTINGS", () => {
  describe("graph.show_values", () => {
    const getHidden =
      GRAPH_DISPLAY_VALUES_SETTINGS["graph.show_values"].getHidden;
    it("should be hidden on normalized area charts", () => {
      const isHidden = getHidden(
        [{ card: { display: "area" } }, { card: { display: "area" } }],
        {
          series: series => ({ display: series.card.display }),
          "stackable.stack_type": "normalized",
        },
      );

      expect(isHidden).toBe(true);
    });

    it("should not be hidden on normalized charts with line series", () => {
      const isHidden = getHidden(
        [
          { card: { display: "area" } },
          { card: { display: "area" } },
          { card: { display: "line" } },
        ],
        {
          series: series => ({ display: series.card.display }),
          "stackable.stack_type": "normalized",
        },
      );

      expect(isHidden).toBe(false);
    });
  });

  describe("graph.label_value_frequency", () => {
    const getHidden =
      GRAPH_DISPLAY_VALUES_SETTINGS["graph.label_value_frequency"].getHidden;

    it("should be hidden when data values are hidden", () => {
      const isHidden = getHidden(
        [
          { card: { display: "line" } },
          { card: { display: "area" } },
          { card: { display: "bar" } },
        ],
        {
          series: series => ({ display: series.card.display }),
          "graph.show_values": false,
        },
      );

      expect(isHidden).toBe(true);
    });
    it("should be hidden on normalized charts without line series", () => {
      const isHidden = getHidden(
        [
          { card: { display: "area" } },
          { card: { display: "area" } },
          { card: { display: "bar" } },
        ],
        {
          series: series => ({ display: series.card.display }),
          "stackable.stack_type": "normalized",
        },
      );

      expect(isHidden).toBe(true);
    });

    it("should be hidden on normalized area charts", () => {
      const isHidden = getHidden(
        [
          { card: { display: "area" } },
          { card: { display: "area" } },
          { card: { display: "area" } },
        ],
        {
          series: series => ({ display: series.card.display }),
          "stackable.stack_type": "normalized",
        },
      );

      expect(isHidden).toBe(true);
    });

    it("should be hidden on normalized bar charts", () => {
      const isHidden = getHidden(
        [
          { card: { display: "bar" } },
          { card: { display: "bar" } },
          { card: { display: "bar" } },
        ],
        {
          series: series => ({ display: series.card.display }),
          "stackable.stack_type": "normalized",
        },
      );

      expect(isHidden).toBe(true);
    });

    it("should not be hidden on normalized charts with line series", () => {
      const isHidden = getHidden(
        [
          { card: { display: "area" } },
          { card: { display: "area" } },
          { card: { display: "line" } },
        ],
        {
          series: series => ({ display: series.card.display }),
          "stackable.stack_type": "normalized",
          "graph.show_values": true,
        },
      );

      expect(isHidden).toBe(false);
    });
  });

  describe("graph.show_stack_values", () => {
    const getHidden =
      GRAPH_DISPLAY_VALUES_SETTINGS["graph.show_stack_values"].getHidden;

    it("should be hidden on non-stacked charts", () => {
      const isHidden = getHidden(
        [{ card: { display: "bar" } }, { card: { display: "bar" } }],
        {
          series: series => ({ display: series.card.display }),
          "stackable.stack_type": null,
          "graph.show_values": true,
        },
      );

      expect(isHidden).toBe(true);
    });

    it("should be hidden on stacked area charts", () => {
      const isHidden = getHidden(
        [{ card: { display: "area" } }, { card: { display: "area" } }],
        {
          series: series => ({ display: series.card.display }),
          "stackable.stack_type": "stacked",
          "graph.show_values": true,
        },
      );

      expect(isHidden).toBe(true);
    });

    it("should not be hidden on mixed stacked area and bar charts", () => {
      const isHidden = getHidden(
        [
          { card: { display: "area" } },
          { card: { display: "area" } },
          { card: { display: "bar" } },
          { card: { display: "bar" } },
        ],
        {
          series: series => ({ display: series.card.display }),
          "stackable.stack_type": "stacked",
          "graph.show_values": true,
        },
      );

      expect(isHidden).toBe(false);
    });

    it("should be hidden on normalized charts bar charts", () => {
      const isHidden = getHidden(
        [{ card: { display: "bar" } }, { card: { display: "bar" } }],
        {
          series: series => ({ display: series.card.display }),
          "stackable.stack_type": "normalized",
          "graph.show_values": true,
        },
      );

      expect(isHidden).toBe(true);
    });

    it("should be hidden on stacked bar charts when show values setting is false", () => {
      const isHidden = getHidden(
        [{ card: { display: "bar" } }, { card: { display: "bar" } }],
        {
          series: series => ({ display: series.card.display }),
          "stackable.stack_type": "stacked",
          "graph.show_values": false,
        },
      );

      expect(isHidden).toBe(true);
    });
  });
});
