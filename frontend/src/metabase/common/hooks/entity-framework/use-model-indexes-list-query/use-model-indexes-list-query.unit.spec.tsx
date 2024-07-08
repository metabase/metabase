import { setupModelIndexEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { createMockModelIndex } from "metabase-types/api/mocks";

import { useModelIndexesListQuery } from "./use-model-indexes-list-query";

const model_id = 1;
const TEST_ITEM = createMockModelIndex({ model_id });

const TestComponent = () => {
  const {
    data = [],
    metadata,
    isLoading,
    error,
  } = useModelIndexesListQuery({ query: { model_id } });

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      {data.map((item, index) => (
        <span key={index}>{item.state}</span>
      ))}

      <div data-testid="metadata">
        {(!metadata || Object.keys(metadata).length === 0) && "No metadata"}
      </div>
    </div>
  );
};

const setup = () => {
  setupModelIndexEndpoints(model_id, [TEST_ITEM]);
  renderWithProviders(<TestComponent />);
};

describe("useModelIndexesListQuery", () => {
  it("should be initially loading", () => {
    setup();
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(screen.getByText(TEST_ITEM.state)).toBeInTheDocument();
  });

  it("should not have any metadata in the response", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(
      within(screen.getByTestId("metadata")).getByText("No metadata"),
    ).toBeInTheDocument();
  });
});
