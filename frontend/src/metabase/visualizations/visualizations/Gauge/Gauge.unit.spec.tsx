import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { ThemeProvider } from "metabase/ui";
import type { VisualizationProps } from "metabase/visualizations/types";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockSingleSeries,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { Gauge } from "./Gauge";
import { MIN_WIDTH_LABEL_THRESHOLD } from "./constants";
import type { GaugeSegment } from "./types";

interface SetupOpts {
  segments: GaugeSegment[];
}

const setup = ({ segments }: SetupOpts) => {
  const card = createMockCard({ display: "gauge" });
  const series = createMockSingleSeries(
    card,
    createMockDataset({
      data: createMockDatasetData({
        cols: [createMockColumn({ name: "count", display_name: "Count" })],
        rows: [[75]],
      }),
    }),
  );

  const onHoverChange = jest.fn();
  const onVisualizationClick = jest.fn();

  const props: VisualizationProps = {
    series: [series],
    rawSeries: [series],
    data: series.data,
    card,
    settings: createMockVisualizationSettings({
      column: () => ({}),
      "gauge.range": [0, 200],
      "gauge.segments": segments,
    }),
    fontFamily: "Lato",
    isFullscreen: false,
    isQueryBuilder: false,
    isEmbeddingSdk: false,
    showTitle: false,
    isDashboard: false,
    isDocument: false,
    isVisualizer: false,
    isVisualizerCard: false,
    isEditing: false,
    isMetricsViewer: false,
    isMobile: false,
    isSettings: false,
    // hover tooltips are only wired up when the segment labels are hidden
    width: MIN_WIDTH_LABEL_THRESHOLD - 50,
    height: 200,
    visualizationIsClickable: () => true,
    onRender: () => undefined,
    onRenderError: () => undefined,
    onActionDismissal: () => undefined,
    onHoverChange,
    onVisualizationClick,
    onUpdateVisualizationSettings: () => undefined,
    dispatch: jest.fn(),
  };

  renderWithProviders(
    <ThemeProvider>
      <Gauge {...props} />
    </ThemeProvider>,
  );

  return { onHoverChange, onVisualizationClick };
};

describe("Gauge", () => {
  beforeAll(() => {
    // jsdom doesn't implement SVG text measurement, which the center label uses
    Object.defineProperty(SVGElement.prototype, "getBBox", {
      configurable: true,
      value: () => ({ x: 0, y: 0, width: 10, height: 10 }),
    });
  });

  afterAll(() => {
    Reflect.deleteProperty(SVGElement.prototype, "getBBox");
  });

  describe("a range whose min is greater than its max", () => {
    const swappedSegment: GaugeSegment = {
      min: 100,
      max: 50,
      label: "Swapped",
      color: "red",
    };

    it("should show the bounds in ascending order in the hover tooltip", async () => {
      const { onHoverChange } = setup({ segments: [swappedSegment] });

      await userEvent.hover(screen.getByTestId("gauge-arc-0"));

      expect(onHoverChange).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [expect.objectContaining({ value: "50 - 100" })],
        }),
      );
    });

    it("should pass the lower bound as the clicked value", async () => {
      const { onVisualizationClick } = setup({ segments: [swappedSegment] });

      await userEvent.click(screen.getByTestId("gauge-arc-0"));

      expect(onVisualizationClick).toHaveBeenCalledWith(
        expect.objectContaining({ value: 50 }),
      );
    });
  });

  describe("a range whose min is less than its max", () => {
    it("should keep the bounds as they are", async () => {
      const { onHoverChange, onVisualizationClick } = setup({
        segments: [{ min: 50, max: 100, label: "Ordered", color: "green" }],
      });

      await userEvent.hover(screen.getByTestId("gauge-arc-0"));
      await userEvent.click(screen.getByTestId("gauge-arc-0"));

      expect(onHoverChange).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [expect.objectContaining({ value: "50 - 100" })],
        }),
      );
      expect(onVisualizationClick).toHaveBeenCalledWith(
        expect.objectContaining({ value: 50 }),
      );
    });
  });
});
