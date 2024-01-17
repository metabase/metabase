import { render, screen } from "__support__/ui";

import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockSingleSeries,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";
import registerVisualizations from "metabase/visualizations/register";
import Funnel from "./Funnel";

registerVisualizations();

const cardTitle = "cardTitle";

const setup = (funnelProps, visualizationSettings = {}) => {
  const card = createMockCard({
    display: "funnel",
  });
  const series = createMockSingleSeries(
    card,
    createMockDataset({
      data: createMockDatasetData({
        cols: [
          createMockColumn({ display_name: "foo" }),
          createMockColumn({ display_name: "bar" }),
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
    column: jest.fn(),
    ...visualizationSettings,
  });

  render(
    <Funnel
      series={[series]}
      settings={settings}
      visualizationIsClickable={jest.fn()}
      card={card}
      {...funnelProps}
    />,
  );
};

describe("funnel", () => {
  it("should not render the title when showTitle=false", async () => {
    setup({ showTitle: false });
    expect(screen.queryByText(cardTitle)).not.toBeInTheDocument();
  });

  it("should render the title when showTitle=true", async () => {
    setup({ showTitle: true });
    expect(screen.getByText(cardTitle)).toBeInTheDocument();
  });

  describe("funnel bar chart", () => {
    const setupFunnelBarChart = funnelProps =>
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
