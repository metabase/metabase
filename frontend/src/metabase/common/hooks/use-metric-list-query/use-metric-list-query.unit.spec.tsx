import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { createMockMetric } from "metabase-types/api/mocks";
import { setupMetricsEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { useMetricListQuery } from "./use-metric-list-query";

const TEST_METRIC = createMockMetric();

const TestComponent = () => {
  const { data = [], metadata, isLoading, error } = useMetricListQuery();

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      {data.map(metric => (
        <div key={metric.id}>{metric.name}</div>
      ))}

      <div data-testid="metadata">
        {(!metadata || Object.keys(metadata).length === 0) && "No metadata"}
      </div>
    </div>
  );
};

const setup = () => {
  setupMetricsEndpoints([TEST_METRIC]);
  renderWithProviders(<TestComponent />);
};

describe("useMetricListQuery", () => {
  it("should be initially loading", () => {
    setup();
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(screen.getByText(TEST_METRIC.name)).toBeInTheDocument();
  });

  it("should not have any metadata in the response", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(
      within(screen.getByTestId("metadata")).getByText("No metadata"),
    ).toBeInTheDocument();
  });
});
