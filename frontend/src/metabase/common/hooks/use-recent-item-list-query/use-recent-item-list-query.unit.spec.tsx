import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { createMockRecentItem } from "metabase-types/api/mocks";
import { setupRecentViewsEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
  within,
} from "__support__/ui";
import { useRecentItemListQuery } from "./use-recent-item-list-query";

const TEST_ITEM = createMockRecentItem();

const TestComponent = () => {
  const { data = [], metadata, isLoading, error } = useRecentItemListQuery();

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      {data.map((item, index) => (
        <div key={index}>{item.model_object.name}</div>
      ))}

      <div data-testid="metadata">
        {(!metadata || Object.keys(metadata).length === 0) && "No metadata"}
      </div>
    </div>
  );
};

const setup = () => {
  setupRecentViewsEndpoints([TEST_ITEM]);
  renderWithProviders(<TestComponent />);
};

describe("useRecentItemListQuery", () => {
  it("should be initially loading", () => {
    setup();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    expect(screen.getByText(TEST_ITEM.model_object.name)).toBeInTheDocument();
  });

  it("should not have any metadata in the response", async () => {
    setup();
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    expect(
      within(screen.getByTestId("metadata")).getByText("No metadata"),
    ).toBeInTheDocument();
  });
});
