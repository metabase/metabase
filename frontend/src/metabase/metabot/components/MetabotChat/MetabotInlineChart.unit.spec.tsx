import fetchMock from "fetch-mock";

import { setupCardDataset } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { GeneratedCard } from "metabase/api/ai-streaming/schemas";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import { MetabotInlineChart } from "./MetabotInlineChart";

// Visualization pulls in the whole charting stack; stub it to a sentinel so we
// can unit test MetabotInlineChart's run / render-states logic.
jest.mock("metabase/visualizations/components/Visualization", () => ({
  __esModule: true,
  default: () => <div data-testid="visualization" />,
}));

const datasetQuery = createMockStructuredDatasetQuery();

const value: GeneratedCard = {
  type: "card",
  id: "card-1",
  title: "Orders by month",
  query: { id: "q-1", query: datasetQuery },
  display: "bar",
};

function setup(
  args: Parameters<typeof setupCardDataset>[0] = {},
  valueOverrides: Partial<GeneratedCard> = {},
) {
  setupCardDataset(args);
  return renderWithProviders(
    <MetabotInlineChart value={{ ...value, ...valueOverrides }} />,
  );
}

describe("MetabotInlineChart", () => {
  beforeEach(() => {
    fetchMock.clearHistory();
  });

  it("runs the embedded query and renders the visualization", async () => {
    setup();
    expect(screen.getByTestId("metabot-inline-chart")).toBeInTheDocument();
    expect(await screen.findByTestId("visualization")).toBeInTheDocument();
    expect(fetchMock.callHistory.called("path:/api/dataset")).toBe(true);
  });

  it("shows the title as a link", () => {
    setup();
    expect(screen.getByText("Orders by month")).toHaveAttribute(
      "target",
      "_blank",
    );
  });

  it("does not render the visualization while results are loading", () => {
    setup();
    expect(screen.queryByTestId("visualization")).not.toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    setup({ status: 500 });
    expect(screen.queryByTestId("visualization")).not.toBeInTheDocument();
    expect(
      await screen.findByText("There was a problem displaying this chart."),
    ).toBeInTheDocument();
  });

  it("shows an error message when the dataset comes back with an error", async () => {
    setup({ dataset: { error: "Something went wrong" } });
    expect(screen.queryByTestId("visualization")).not.toBeInTheDocument();
    expect(
      await screen.findByText("There was a problem displaying this chart."),
    ).toBeInTheDocument();
  });

  it("surfaces a permission error with the permission message", async () => {
    setup({
      dataset: {
        error: "no access",
        error_type: "missing-required-permissions",
      },
    });
    expect(
      await screen.findByText(
        "Sorry, you don't have permission to see this card.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the curated error text when present", async () => {
    setup({
      dataset: {
        error: "Column FOO does not exist",
        error_is_curated: true,
      },
    });
    expect(
      await screen.findByText("Column FOO does not exist"),
    ).toBeInTheDocument();
  });
});
