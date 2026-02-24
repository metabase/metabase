import { checkNotNull } from "metabase/lib/types";
import type { VisualizationDisplay } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockInsight,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import {
  GRAPH_AXIS_SETTINGS,
  GRAPH_DISPLAY_VALUES_SETTINGS,
  GRAPH_TREND_SETTINGS,
  STACKABLE_SETTINGS,
  TOOLTIP_SETTINGS,
  getDefaultDimensionLabel,
} from "./graph";

describe("STACKABLE_SETTINGS", () => {
  describe("stackable.stack_type", () => {
    describe("getDefault", () => {
      const getDefault = checkNotNull(
        STACKABLE_SETTINGS["stackable.stack_type"].getDefault,
      );

      it("should return stacked if area chart has more than 1 metric", () => {
        const value = getDefault(
          [createMockSingleSeries({ display: "area" })],
          {
            "graph.metrics": ["foo", "bar"],
            "graph.dimensions": [],
          },
        );

        expect(value).toBe("stacked");
      });

      it("should return stacked if area chart has more than 1 dimension", () => {
        const value = getDefault(
          [createMockSingleSeries({ display: "area" })],
          {
            "graph.metrics": [],
            "graph.dimensions": ["foo", "bar"],
          },
        );

        expect(value).toBe("stacked");
      });

      it("should return null if area chart has 1 metric and 1 dimension", () => {
        const value = getDefault(
          [createMockSingleSeries({ display: "area" })],
          {
            "graph.metrics": ["foo"],
            "graph.dimensions": ["bar"],
          },
        );

        expect(value).toBeNull();
      });

      it("should return the legacy 'stackable.stacked' value if present", () => {
        const value = getDefault(
          [createMockSingleSeries({ display: "area" })],
          {
            "stackable.stacked": "normalized",
            "graph.metrics": ["foo", "bar"],
            "graph.dimensions": ["bar"],
          },
        );

        expect(value).toBe("normalized");
      });
    });

    describe("isValid", () => {
      const isValid = checkNotNull(
        STACKABLE_SETTINGS["stackable.stack_type"].isValid,
      );

      it("should be valid even on cards with display=line when there are stackable series (metabase#45182)", () => {
        const result = isValid(
          [
            createMockSingleSeries({ id: 1, display: "line" }),
            createMockSingleSeries({ id: 2, display: "line" }),
            createMockSingleSeries({ id: 3, display: "line" }),
          ],
          {
            series: (series) => ({
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
            createMockSingleSeries({ id: 1, display: "bar" }),
            createMockSingleSeries({ id: 2, display: "bar" }),
            createMockSingleSeries({ id: 3, display: "bar" }),
          ],
          {
            series: (series) => ({
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
        display: "scatter" as const,
        expectedHidden: false,
      },
      {
        display: "line" as const,
        expectedHidden: false,
      },
      {
        display: "area" as const,
        expectedHidden: true,
      },
      {
        display: "bar" as const,
        expectedHidden: true,
      },
      {
        display: "combo" as const,
        expectedHidden: false,
      },
      {
        display: "waterfall" as const,
        expectedHidden: true,
      },
    ])(
      "should be visible on all display types except waterfall",
      ({ display, expectedHidden }) => {
        const getHidden = checkNotNull(
          GRAPH_AXIS_SETTINGS["graph.y_axis.unpin_from_zero"].getHidden,
        );
        const isHidden = getHidden([createMockSingleSeries({ display })], {
          "graph.metrics": ["foo"],
          "graph.dimensions": ["bar"],
          "graph.y_axis.auto_range": true,
          series: () => ({ display }),
        });
        expect(isHidden).toBe(expectedHidden);
      },
    );

    it("should be hidden when auto_range is disabled", () => {
      const getHidden = checkNotNull(
        GRAPH_AXIS_SETTINGS["graph.y_axis.unpin_from_zero"].getHidden,
      );
      const isHidden = getHidden(
        [createMockSingleSeries({ display: "line" })],
        {
          "graph.metrics": ["foo"],
          "graph.dimensions": ["bar"],
          "graph.y_axis.auto_range": false,
          series: () => ({ display: "line" }),
        },
      );
      expect(isHidden).toBe(true);
    });

    it("should be hidden when line visualization has overriding series display settings", () => {
      const getHidden = checkNotNull(
        GRAPH_AXIS_SETTINGS["graph.y_axis.unpin_from_zero"].getHidden,
      );
      const isHidden = getHidden(
        [createMockSingleSeries({ display: "line" })],
        {
          "graph.metrics": ["foo"],
          "graph.dimensions": ["bar"],
          "graph.y_axis.auto_range": false,
          series: () => ({ display: "bar" }),
        },
      );
      expect(isHidden).toBe(true);
    });

    it.each([
      {
        display: "scatter" as const,
        expectedDefault: true,
      },
      {
        display: "line" as const,
        expectedDefault: false,
      },
      {
        display: "bar" as const,
        expectedDefault: false,
      },
      {
        display: "combo" as const,
        expectedDefault: false,
      },
    ])(
      "should be enabled by default on scatter charts",
      ({ display, expectedDefault }) => {
        const getDefault = checkNotNull(
          GRAPH_AXIS_SETTINGS["graph.y_axis.unpin_from_zero"].getDefault,
        );
        const isEnabled = getDefault([createMockSingleSeries({ display })], {
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

describe("GRAPH_TREND_SETTINGS", () => {
  describe("graph.show_trendline", () => {
    const getHidden = checkNotNull(
      GRAPH_TREND_SETTINGS["graph.show_trendline"].getHidden,
    );

    it("should be hidden on cards with multiple dimensions", () => {
      const isHidden = getHidden(
        [
          createMockSingleSeries(
            { display: "area" },
            {
              data: createMockDatasetData({
                insights: [
                  createMockInsight({ col: "FOO" }),
                  createMockInsight({ col: "BAR" }),
                ],
              }),
            },
          ),
        ],
        {
          series: (series) => ({ display: series.card.display }),
          "graph.dimensions": ["FOO", "BAR"],
        },
      );

      expect(isHidden).toBe(true);
    });
  });
});

describe("GRAPH_DISPLAY_VALUES_SETTINGS", () => {
  describe("graph.label_value_formatting", () => {
    const getDefault = checkNotNull(
      GRAPH_DISPLAY_VALUES_SETTINGS["graph.label_value_formatting"].getDefault,
    );

    it("should default to an adapted value if there are currency styled columns", () => {
      expect(getDefault([], {})).toBe("auto");

      expect(
        getDefault([], {
          column_settings: {
            foo: { currency_style: "code" },
          },
        }),
      ).toBe("auto");

      expect(
        getDefault([], {
          column_settings: {
            foo: { number_style: "currency", currency_style: "symbol" },
          },
        }),
      ).toBe("auto");

      expect(
        getDefault([], {
          column_settings: {
            foo: { number_style: "currency", currency_style: "name" },
          },
        }),
      ).toBe("full");

      expect(
        getDefault([], {
          column_settings: {
            foo: {
              number_style: "currency",
              currency: "AED",
              number_separators: ".",
              decimals: 5,
              scale: 1.235,
              prefix: "$",
              suffix: " units",
            },
          },
        }),
      ).toBe("auto");
    });
  });

  describe("graph.show_values", () => {
    const getHidden = checkNotNull(
      GRAPH_DISPLAY_VALUES_SETTINGS["graph.show_values"].getHidden,
    );

    it("should be hidden on normalized area charts", () => {
      const isHidden = getHidden(
        [
          createMockSingleSeries({ display: "area" }),
          createMockSingleSeries({ display: "area" }),
        ],
        {
          series: (series) => ({ display: series.card.display }),
          "stackable.stack_type": "normalized",
        },
      );

      expect(isHidden).toBe(true);
    });

    it("should not be hidden on normalized charts with line series", () => {
      const isHidden = getHidden(
        [
          createMockSingleSeries({ display: "area" }),
          createMockSingleSeries({ display: "area" }),
          createMockSingleSeries({ display: "line" }),
        ],
        {
          series: (series) => ({ display: series.card.display }),
          "stackable.stack_type": "normalized",
        },
      );

      expect(isHidden).toBe(false);
    });
  });

  describe("graph.label_value_frequency", () => {
    const getHidden = checkNotNull(
      GRAPH_DISPLAY_VALUES_SETTINGS["graph.label_value_frequency"].getHidden,
    );

    it("should be hidden when data values are hidden", () => {
      const isHidden = getHidden(
        [
          createMockSingleSeries({ display: "line" }),
          createMockSingleSeries({ display: "area" }),
          createMockSingleSeries({ display: "bar" }),
        ],
        {
          series: (series) => ({ display: series.card.display }),
          "graph.show_values": false,
        },
      );

      expect(isHidden).toBe(true);
    });

    it("should be hidden on normalized charts without line series", () => {
      const isHidden = getHidden(
        [
          createMockSingleSeries({ display: "area" }),
          createMockSingleSeries({ display: "area" }),
          createMockSingleSeries({ display: "bar" }),
        ],
        {
          series: (series) => ({ display: series.card.display }),
          "stackable.stack_type": "normalized",
        },
      );

      expect(isHidden).toBe(true);
    });

    it("should be hidden on normalized area charts", () => {
      const isHidden = getHidden(
        [
          createMockSingleSeries({ display: "area" }),
          createMockSingleSeries({ display: "area" }),
          createMockSingleSeries({ display: "area" }),
        ],
        {
          series: (series) => ({ display: series.card.display }),
          "stackable.stack_type": "normalized",
        },
      );

      expect(isHidden).toBe(true);
    });

    it("should be hidden on normalized bar charts", () => {
      const isHidden = getHidden(
        [
          createMockSingleSeries({ display: "bar" }),
          createMockSingleSeries({ display: "bar" }),
          createMockSingleSeries({ display: "bar" }),
        ],
        {
          series: (series) => ({ display: series.card.display }),
          "stackable.stack_type": "normalized",
        },
      );

      expect(isHidden).toBe(true);
    });

    it("should not be hidden on normalized charts with line series", () => {
      const isHidden = getHidden(
        [
          createMockSingleSeries({ display: "area" }),
          createMockSingleSeries({ display: "area" }),
          createMockSingleSeries({ display: "line" }),
        ],
        {
          series: (series) => ({ display: series.card.display }),
          "stackable.stack_type": "normalized",
          "graph.show_values": true,
        },
      );

      expect(isHidden).toBe(false);
    });
  });

  describe("graph.show_stack_values", () => {
    const getHidden = checkNotNull(
      GRAPH_DISPLAY_VALUES_SETTINGS["graph.show_stack_values"].getHidden,
    );

    it("should be hidden on non-stacked charts", () => {
      const isHidden = getHidden(
        [
          createMockSingleSeries({ display: "bar" }),
          createMockSingleSeries({ display: "bar" }),
        ],
        {
          series: (series) => ({ display: series.card.display }),
          "stackable.stack_type": null,
          "graph.show_values": true,
        },
      );

      expect(isHidden).toBe(true);
    });

    it("should be hidden on stacked area charts", () => {
      const isHidden = getHidden(
        [
          createMockSingleSeries({ display: "area" }),
          createMockSingleSeries({ display: "area" }),
        ],
        {
          series: (series) => ({ display: series.card.display }),
          "stackable.stack_type": "stacked",
          "graph.show_values": true,
        },
      );

      expect(isHidden).toBe(true);
    });

    it("should not be hidden on mixed stacked area and bar charts", () => {
      const isHidden = getHidden(
        [
          createMockSingleSeries({ display: "area" }),
          createMockSingleSeries({ display: "area" }),
          createMockSingleSeries({ display: "bar" }),
          createMockSingleSeries({ display: "bar" }),
        ],
        {
          series: (series) => ({ display: series.card.display }),
          "stackable.stack_type": "stacked",
          "graph.show_values": true,
        },
      );

      expect(isHidden).toBe(false);
    });

    it("should be hidden on normalized charts bar charts", () => {
      const isHidden = getHidden(
        [
          createMockSingleSeries({ display: "bar" }),
          createMockSingleSeries({ display: "bar" }),
        ],
        {
          series: (series) => ({ display: series.card.display }),
          "stackable.stack_type": "normalized",
          "graph.show_values": true,
        },
      );

      expect(isHidden).toBe(true);
    });

    it("should be hidden on stacked bar charts when show values setting is false", () => {
      const isHidden = getHidden(
        [
          createMockSingleSeries({ display: "bar" }),
          createMockSingleSeries({ display: "bar" }),
        ],
        {
          series: (series) => ({ display: series.card.display }),
          "stackable.stack_type": "stacked",
          "graph.show_values": false,
        },
      );

      expect(isHidden).toBe(true);
    });
  });
});

describe("graph.tooltip_columns", () => {
  const getHidden = checkNotNull(
    TOOLTIP_SETTINGS["graph.tooltip_columns"].getHidden,
  );
  const getValue = checkNotNull(
    TOOLTIP_SETTINGS["graph.tooltip_columns"].getValue,
  );
  const getProps = checkNotNull(
    TOOLTIP_SETTINGS["graph.tooltip_columns"].getProps,
  );

  describe("getHidden", () => {
    it("should be hidden when there are no available additional columns", () => {
      const mockSeries = [
        createMockSingleSeries(
          {},
          {
            data: createMockDatasetData({
              cols: [
                createMockColumn({ name: "dim", base_type: "type/Text" }),
                createMockColumn({ name: "metric", base_type: "type/Number" }),
              ],
            }),
          },
        ),
      ];

      const isHidden = getHidden(mockSeries, {
        "graph.tooltip_type": "series_comparison",
        "graph.dimensions": ["dim"],
        "graph.metrics": ["metric"],
      });

      expect(isHidden).toBe(true);
    });

    it("should not be hidden when there are available additional columns", () => {
      const mockSeries = [
        createMockSingleSeries(
          createMockCard(),
          createMockDataset({
            data: createMockDatasetData({
              cols: [
                createMockColumn({ name: "dim", base_type: "type/Text" }),
                createMockColumn({ name: "metric1", base_type: "type/Number" }),
                createMockColumn({ name: "metric2", base_type: "type/Number" }),
              ],
            }),
          }),
        ),
      ];

      const isHidden = getHidden(mockSeries, {
        "graph.tooltip_type": "series_comparison",
        "graph.dimensions": ["dim"],
        "graph.metrics": ["metric1"],
      });

      expect(isHidden).toBe(false);
    });

    describe("getValue", () => {
      const getMockSeries = (display: VisualizationDisplay) => [
        createMockSingleSeries(
          createMockCard({ display }),
          createMockDataset({
            data: createMockDatasetData({
              cols: [
                createMockColumn({ name: "dim", base_type: "type/Text" }),
                createMockColumn({
                  name: "metric1",
                  base_type: "type/Number",
                }),
                createMockColumn({
                  name: "metric2",
                  base_type: "type/Number",
                }),
                createMockColumn({
                  name: "metric3",
                  base_type: "type/Number",
                }),
                createMockColumn({
                  name: "category",
                  base_type: "type/Text",
                }),
              ],
            }),
          }),
        ),
      ];

      it("should return all available columns on scatter charts by default", () => {
        const value = getValue(getMockSeries("scatter"), {
          "graph.tooltip_type": "series_comparison",
          "graph.dimensions": ["dim"],
          "graph.metrics": ["metric1"],
        });

        expect(value).toStrictEqual([
          '["name","metric2"]',
          '["name","metric3"]',
          '["name","category"]',
        ]);
      });

      it("should return no additional columns by default", () => {
        const value = getValue(getMockSeries("line"), {
          "graph.tooltip_type": "series_comparison",
          "graph.dimensions": ["dim"],
          "graph.metrics": ["metric1"],
        });

        expect(value).toHaveLength(0);
      });
    });
  });

  describe("getProps", () => {
    it("should return options for available additional columns", () => {
      const mockSeries = [
        createMockSingleSeries(
          createMockCard(),
          createMockDataset({
            data: createMockDatasetData({
              cols: [
                createMockColumn({ name: "dim", base_type: "type/Text" }),
                createMockColumn({
                  name: "metric1",
                  display_name: "Metric 1",
                  base_type: "type/Number",
                }),
                createMockColumn({
                  name: "metric2",
                  display_name: "Metric 2",
                  base_type: "type/Number",
                }),
              ],
            }),
          }),
        ),
      ];

      const props = getProps(
        mockSeries,
        {
          "graph.dimensions": ["dim"],
          "graph.metrics": ["metric1"],
        },
        jest.fn(),
        undefined,
        jest.fn(),
      );

      expect(props).toMatchObject({
        options: [{ label: "Metric 2", value: '["name","metric2"]' }],
      });
    });
  });
});
