import React from "react";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { createMockMetric } from "metabase-types/api/mocks";
import { setupMetricsEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import { useMetricListQuery } from "./use-metric-list-query";

const TEST_METRIC = createMockMetric();

const TestComponent = () => {
  const { data = [], isLoading, error } = useMetricListQuery();

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      {data.map(metric => (
        <div key={metric.id}>{metric.name}</div>
      ))}
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
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    expect(screen.getByText(TEST_METRIC.name)).toBeInTheDocument();
  });
});
