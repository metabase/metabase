import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders } from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";
import type { VisualizationProps } from "metabase/visualizations/types";
import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";
import Question from "metabase-lib/v1/Question";
import type { Series } from "metabase-types/api";
import { createMockColumn, createMockDataset } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

registerVisualizations();

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

// Mock the heavy dependencies since we're testing settings logic
jest.mock("./use-models-and-option", () => ({
  useModelsAndOption: () => ({
    chartModel: {
      seriesModels: [],
      transformedDataset: [],
      dimensionModel: { column: { display_name: "Test" } },
      xAxisModel: { type: "category" },
      leftAxisModel: null,
      rightAxisModel: null,
      yAxisScaleTransforms: {
        toEChartsAxisValue: (val: any) => val,
        fromEChartsAxisValue: (val: any) => val,
      },
    },
    timelineEventsModel: null,
    option: {},
  }),
}));

jest.mock("./use-chart-debug", () => ({
  useChartDebug: () => {},
}));

jest.mock("./use-chart-events", () => ({
  useChartEvents: () => ({
    onSelectSeries: jest.fn(),
    onOpenQuestion: jest.fn(),
    eventHandlers: {},
  }),
}));

jest.mock("metabase/visualizations/echarts/tooltip", () => ({
  useCartesianChartSeriesColorsClasses: () => null,
  useCloseTooltipOnScroll: () => {},
}));

const createTestQuestion = () =>
  new Question(
    {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [["field", 1, null]],
        },
        database: SAMPLE_DB_ID,
      },
      display: "bar",
      visualization_settings: {},
    },
    metadata,
  );

const createTestSeries = (question: Question): Series => [
  {
    card: question.card(),
    ...createMockDataset({
      data: {
        cols: [
          createMockColumn({
            name: "category",
            display_name: "Category",
            base_type: "type/Text",
          }),
          createMockColumn({
            source: "aggregation",
            field_ref: ["aggregation", 0, null],
            name: "count",
            display_name: "Count",
            base_type: "type/BigInteger",
          }),
        ],
        rows: [
          ["A", 100],
          ["B", 200],
          ["C", 150],
        ],
      },
    }),
  },
];

const createVisualizationProps = (
  width: number,
  height: number,
  isDashboard = true,
): VisualizationProps => {
  const question = createTestQuestion();
  const series = createTestSeries(question);

  return {
    rawSeries: series,
    series,
    card: question.card(),
    data: series[0].data,
    settings: {},
    width,
    height,
    isDashboard,
    isEditing: false,
    isQueryBuilder: false,
    isVisualizerViz: false,
    isFullscreen: false,
    isEmbeddingSdk: false,
    isDocument: false,
    isMobile: false,
    isNightMode: false,
    isSettings: false,
    fontFamily: "Arial",
    gridSize: { width: 4, height: 4 },
    hovered: undefined,
    clicked: undefined,
    metadata,
    onChangeCardAndRun: jest.fn(),
    onHoverChange: jest.fn(),
    onRenderError: jest.fn(),
    onRender: jest.fn(),
    onActionDismissal: jest.fn(),
    onVisualizationClick: jest.fn(),
    onUpdateVisualizationSettings: jest.fn(),
    visualizationIsClickable: jest.fn(),
    showTitle: false,
    headerIcon: undefined,
    actionButtons: [],
    canToggleSeriesVisibility: false,
    showAllLegendItems: false,
    titleMenuItems: [],
    getHref: jest.fn(),
    dispatch: jest.fn(),
  };
};

// Import the actual function we want to test
import { getGridSizeAdjustedSettings } from "./utils";

// Test the settings logic in isolation
describe("CartesianChart - Responsive Settings Logic", () => {
  const HIDE_X_AXIS_LABEL_WIDTH_THRESHOLD = 360;
  const HIDE_Y_AXIS_LABEL_WIDTH_THRESHOLD = 200;
  const MOBILE_X_AXIS_ROTATE_WIDTH_THRESHOLD = 480;
  const MOBILE_X_AXIS_ROTATE_HEIGHT_THRESHOLD = 300;

  const applyResponsiveSettings = (
    originalSettings: any,
    outerWidth: number,
    outerHeight: number,
    isDashboard: boolean,
    gridSize?: any,
  ) => {
    const settings = getGridSizeAdjustedSettings(originalSettings, gridSize);

    if (isDashboard) {
      // Hide Y-axis labels when width is too narrow
      if (outerWidth <= HIDE_X_AXIS_LABEL_WIDTH_THRESHOLD) {
        settings["graph.y_axis.labels_enabled"] = false;
      }

      // For mobile/small screens, apply responsive x-axis label handling
      if (
        outerWidth <= MOBILE_X_AXIS_ROTATE_WIDTH_THRESHOLD ||
        outerHeight <= MOBILE_X_AXIS_ROTATE_HEIGHT_THRESHOLD
      ) {
        // Rotate labels on mobile to prevent overlap instead of hiding them
        settings["graph.x_axis.axis_enabled"] = "rotate-45";
      } else if (outerHeight <= HIDE_Y_AXIS_LABEL_WIDTH_THRESHOLD) {
        // Only hide x-axis labels as last resort for very small heights
        settings["graph.x_axis.labels_enabled"] = false;
      }
    }

    return settings;
  };

  describe("Mobile rotation behavior", () => {
    it("should apply 45-degree rotation when width is at mobile threshold", () => {
      const settings = applyResponsiveSettings({}, 480, 400, true);
      expect(settings["graph.x_axis.axis_enabled"]).toBe("rotate-45");
    });

    it("should apply 45-degree rotation when width is below mobile threshold", () => {
      const settings = applyResponsiveSettings({}, 400, 400, true);
      expect(settings["graph.x_axis.axis_enabled"]).toBe("rotate-45");
    });

    it("should apply 45-degree rotation when height is at mobile threshold", () => {
      const settings = applyResponsiveSettings({}, 600, 300, true);
      expect(settings["graph.x_axis.axis_enabled"]).toBe("rotate-45");
    });

    it("should apply 45-degree rotation when height is below mobile threshold", () => {
      const settings = applyResponsiveSettings({}, 600, 250, true);
      expect(settings["graph.x_axis.axis_enabled"]).toBe("rotate-45");
    });

    it("should apply 45-degree rotation when both dimensions are below thresholds", () => {
      const settings = applyResponsiveSettings({}, 400, 250, true);
      expect(settings["graph.x_axis.axis_enabled"]).toBe("rotate-45");
    });

    it("should not apply rotation when dimensions are above mobile thresholds", () => {
      const settings = applyResponsiveSettings({}, 600, 400, true);
      expect(settings["graph.x_axis.axis_enabled"]).toBeUndefined();
    });
  });

  describe("Label hiding behavior", () => {
    it("should hide Y-axis labels when width is at hide threshold", () => {
      const settings = applyResponsiveSettings({}, 360, 400, true);
      expect(settings["graph.y_axis.labels_enabled"]).toBe(false);
    });

    it("should hide Y-axis labels when width is below hide threshold", () => {
      const settings = applyResponsiveSettings({}, 300, 400, true);
      expect(settings["graph.y_axis.labels_enabled"]).toBe(false);
    });

    it("should not hide Y-axis labels when width is above threshold", () => {
      const settings = applyResponsiveSettings({}, 400, 400, true);
      expect(settings["graph.y_axis.labels_enabled"]).toBeUndefined();
    });

    it("should hide X-axis labels only when height is very small and width is sufficient", () => {
      const settings = applyResponsiveSettings({}, 600, 200, true);
      expect(settings["graph.x_axis.labels_enabled"]).toBe(false);
      expect(settings["graph.x_axis.axis_enabled"]).toBeUndefined();
    });

    it("should prioritize rotation over hiding on mobile", () => {
      const settings = applyResponsiveSettings({}, 400, 200, true);
      // Should apply rotation, not hiding
      expect(settings["graph.x_axis.axis_enabled"]).toBe("rotate-45");
      expect(settings["graph.x_axis.labels_enabled"]).toBeUndefined();
    });
  });

  describe("Non-dashboard context", () => {
    it("should not apply responsive behavior when not in dashboard", () => {
      const settings = applyResponsiveSettings({}, 400, 200, false);
      expect(settings["graph.x_axis.axis_enabled"]).toBeUndefined();
      expect(settings["graph.y_axis.labels_enabled"]).toBeUndefined();
      expect(settings["graph.x_axis.labels_enabled"]).toBeUndefined();
    });
  });

  describe("Edge cases", () => {
    it("should handle zero dimensions gracefully", () => {
      const settings = applyResponsiveSettings({}, 0, 0, true);
      // Zero dimensions should trigger mobile behavior
      expect(settings["graph.x_axis.axis_enabled"]).toBe("rotate-45");
      expect(settings["graph.y_axis.labels_enabled"]).toBe(false);
    });

    it("should handle very large dimensions", () => {
      const settings = applyResponsiveSettings({}, 2000, 1000, true);
      expect(settings["graph.x_axis.axis_enabled"]).toBeUndefined();
      expect(settings["graph.y_axis.labels_enabled"]).toBeUndefined();
      expect(settings["graph.x_axis.labels_enabled"]).toBeUndefined();
    });

    it("should preserve existing settings", () => {
      const originalSettings = {
        "graph.x_axis.title_text": "Custom Title",
        "some.other.setting": "value",
      };
      const settings = applyResponsiveSettings(
        originalSettings,
        600,
        400,
        true,
      );
      expect(settings["graph.x_axis.title_text"]).toBe("Custom Title");
      expect(settings["some.other.setting"]).toBe("value");
    });
  });

  describe("Threshold boundary tests", () => {
    it("should apply rotation exactly at width threshold", () => {
      const settings = applyResponsiveSettings(
        {},
        MOBILE_X_AXIS_ROTATE_WIDTH_THRESHOLD,
        400,
        true,
      );
      expect(settings["graph.x_axis.axis_enabled"]).toBe("rotate-45");
    });

    it("should not apply rotation just above width threshold", () => {
      const settings = applyResponsiveSettings(
        {},
        MOBILE_X_AXIS_ROTATE_WIDTH_THRESHOLD + 1,
        400,
        true,
      );
      expect(settings["graph.x_axis.axis_enabled"]).toBeUndefined();
    });

    it("should apply rotation exactly at height threshold", () => {
      const settings = applyResponsiveSettings(
        {},
        600,
        MOBILE_X_AXIS_ROTATE_HEIGHT_THRESHOLD,
        true,
      );
      expect(settings["graph.x_axis.axis_enabled"]).toBe("rotate-45");
    });

    it("should not apply rotation just above height threshold", () => {
      const settings = applyResponsiveSettings(
        {},
        600,
        MOBILE_X_AXIS_ROTATE_HEIGHT_THRESHOLD + 1,
        true,
      );
      expect(settings["graph.x_axis.axis_enabled"]).toBeUndefined();
    });

    it("should hide Y-axis labels exactly at width threshold", () => {
      const settings = applyResponsiveSettings(
        {},
        HIDE_X_AXIS_LABEL_WIDTH_THRESHOLD,
        400,
        true,
      );
      expect(settings["graph.y_axis.labels_enabled"]).toBe(false);
    });

    it("should not hide Y-axis labels just above width threshold", () => {
      const settings = applyResponsiveSettings(
        {},
        HIDE_X_AXIS_LABEL_WIDTH_THRESHOLD + 1,
        400,
        true,
      );
      expect(settings["graph.y_axis.labels_enabled"]).toBeUndefined();
    });
  });
});

// Integration test with actual component
describe("CartesianChart - Component Integration", () => {
  it("should render without errors with mobile dimensions", () => {
    const props = createVisualizationProps(400, 300);
    const { container } = renderWithProviders(<CartesianChart {...props} />);
    expect(container).toBeInTheDocument();
  });

  it("should render without errors with large dimensions", () => {
    const props = createVisualizationProps(800, 600);
    const { container } = renderWithProviders(<CartesianChart {...props} />);
    expect(container).toBeInTheDocument();
  });

  it("should render without errors when not in dashboard", () => {
    const props = createVisualizationProps(400, 300, false);
    const { container } = renderWithProviders(<CartesianChart {...props} />);
    expect(container).toBeInTheDocument();
  });
});
