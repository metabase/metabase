import {
  setupCollectionsEndpoints,
  setupCollectionsWithError,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
  within,
} from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useCollectionListQuery } from "./use-collection-list-query";

const TEST_COLLECTION = createMockCollection();

const TestComponent = () => {
  const { data = [], metadata, isLoading, error } = useCollectionListQuery();

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      {data.map(collection => (
        <div key={collection.id}>{collection.name}</div>
      ))}
      <div data-testid="metadata">
        {(!metadata || Object.keys(metadata).length === 0) && "No metadata"}
      </div>
    </div>
  );
};

const setup = ({ error }: { error?: string } = {}) => {
  if (error) {
    setupCollectionsWithError({ error });
  } else {
    setupCollectionsEndpoints({ collections: [TEST_COLLECTION] });
  }

  renderWithProviders(<TestComponent />);
};

describe("useCollectionListQuery", () => {
  it("should be initially loading", () => {
    setup();

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("should display error", async () => {
    const ERROR = "Server error";

    setup({ error: ERROR });

    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));

    expect(screen.getByText(ERROR)).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();

    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));

    expect(screen.getByText(TEST_COLLECTION.name)).toBeInTheDocument();
  });

  it("should not have any metadata in the response", async () => {
    setup();
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    expect(
      within(screen.getByTestId("metadata")).getByText("No metadata"),
    ).toBeInTheDocument();
  });
});
