import { renderWithProviders, screen } from "__support__/ui";
import { ThemeProvider } from "metabase/ui";
import registerVisualizations from "metabase/visualizations/register";
import type { VisualizationProps } from "metabase/visualizations/types";
import type { VisualizationSettings } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockNumericColumn,
  createMockSingleSeries,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { Funnel } from "./Funnel";

registerVisualizations();

const cardTitle = "cardTitle";

type SetupFunnelProps = Pick<VisualizationProps, "showTitle">;

const setup = (
  funnelProps: SetupFunnelProps,
  visualizationSettings: VisualizationSettings = {},
) => {
  const card = createMockCard({
    display: "funnel",
  });

  const series = createMockSingleSeries(
    card,
    createMockDataset({
      data: createMockDatasetData({
        cols: [
          createMockColumn({ id: 1, name: "foo", display_name: "foo" }),
          createMockNumericColumn({
            id: 2,
            name: "bar",
            display_name: "bar",
          }),
        ],
        rows: [
          [10, 20],
          [100, 200],
        ],
      }),
    }),
  );

  const settings = createMockVisualizationSettings({
    "card.title": cardTitle,
    "funnel.metric": "bar",
    "funnel.dimension": "foo",
    column: jest.fn(),
    ...visualizationSettings,
  });
  const funnelPropsForRender: VisualizationProps = {
    series: [series],
    rawSeries: [series],
    data: series.data,
    card,
    settings,
    fontFamily: "Lato",
    isFullscreen: false,
    isQueryBuilder: false,
    isEmbeddingSdk: false,
    showTitle: funnelProps.showTitle,
    isDashboard: false,
    isDocument: false,
    isVisualizer: false,
    isVisualizerCard: false,
    isEditing: false,
    isMobile: false,
    isSettings: false,
    width: 500,
    height: 300,
    visualizationIsClickable: () => false,
    onRender: () => undefined,
    onRenderError: () => undefined,
    onActionDismissal: () => undefined,
    onHoverChange: () => undefined,
    onVisualizationClick: () => undefined,
    onUpdateVisualizationSettings: () => undefined,
    dispatch: jest.fn(),
  };

  renderWithProviders(
    <ThemeProvider>
      <Funnel {...funnelPropsForRender} />
    </ThemeProvider>,
  );
};

describe("Funnel", () => {
  it("should not render the title when showTitle=false", async () => {
    setup({ showTitle: false });
    expect(screen.queryByText(cardTitle)).not.toBeInTheDocument();
  });

  it("should render the title when showTitle=true", async () => {
    setup({ showTitle: true });
    expect(screen.getByText(cardTitle)).toBeInTheDocument();
  });

  describe("funnel bar chart", () => {
    const setupFunnelBarChart = (funnelProps: SetupFunnelProps) =>
      setup(funnelProps, { "funnel.type": "bar" });

    it("should not render the title when showTitle=false", async () => {
      setupFunnelBarChart({ showTitle: false });
      expect(screen.queryByText(cardTitle)).not.toBeInTheDocument();
    });

    it("should render the title when showTitle=true", async () => {
      setupFunnelBarChart({ showTitle: true });
      expect(screen.getByText(cardTitle)).toBeInTheDocument();
    });
  });
});
