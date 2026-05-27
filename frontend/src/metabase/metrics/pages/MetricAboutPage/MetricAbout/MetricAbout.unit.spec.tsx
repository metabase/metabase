import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockCard } from "metabase-types/api/mocks";

import { MetricAbout } from "./MetricAbout";

jest.mock("metabase/metrics/utils/validation", () => ({
  isNumericMetric: jest.fn().mockReturnValue(false),
}));

jest.mock("metabase/metrics/common/hooks", () => ({
  useMetricDefinition: jest.fn().mockReturnValue({
    definition: null,
    isLoading: false,
  }),
}));

jest.mock("./AboutVisualization", () => ({
  AboutVisualization: () => <div data-testid="about-visualization" />,
}));

jest.mock(
  "metabase/data-studio/common/components/OverviewVisualization",
  () => ({
    OverviewVisualization: () => <div data-testid="overview-visualization" />,
  }),
);

jest.mock("./DescriptionSection", () => ({
  DescriptionSection: () => <div data-testid="description-section" />,
}));

const mockUrls = {
  about: (id: number) => `/metric/${id}`,
  overview: (id: number) => `/metric/${id}/overview`,
  query: (id: number) => `/metric/${id}/query`,
  dependencies: (id: number) => `/metric/${id}/dependencies`,
  caching: (id: number) => `/metric/${id}/caching`,
  history: (id: number) => `/metric/${id}/history`,
};

function setup({ isNumeric = false }: { isNumeric?: boolean } = {}) {
  const validation = jest.requireMock("metabase/metrics/utils/validation");
  validation.isNumericMetric.mockReturnValue(isNumeric);

  const card = createMockCard({ id: 42, type: "metric" });

  renderWithProviders(
    <Route
      path="/"
      component={() => <MetricAbout card={card} urls={mockUrls} />}
    />,
    {
      storeInitialState: createMockState(),
      withRouter: true,
      initialRoute: "/",
    },
  );

  return { card };
}

describe("MetricAbout", () => {
  it("renders the Explore button on the chart card for numeric metrics", () => {
    setup({ isNumeric: true });

    expect(screen.getByTestId("explore-link")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Explore/i })).toHaveAttribute(
      "href",
      "/explore?metricId=42",
    );
  });

  it("does not render the Explore button for non-numeric metrics", () => {
    setup({ isNumeric: false });

    expect(screen.queryByTestId("explore-link")).not.toBeInTheDocument();
  });
});
