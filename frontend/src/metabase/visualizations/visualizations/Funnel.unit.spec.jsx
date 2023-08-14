import { render, screen } from "__support__/ui";

import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockSingleSeries,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";
import Funnel from "./Funnel";

const cardTitle = "cardTitle";

const setup = funnelProps => {
  const series = createMockSingleSeries(
    createMockCard(),
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
  });

  render(
    <Funnel
      series={[series]}
      settings={settings}
      visualizationIsClickable={jest.fn()}
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
});
