import { setupCollectionsEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useCollectionsQuery } from "./use-collections-query";

const TEST_COLLECTION = createMockCollection();

const TestComponent = () => {
  const { data = [], isLoading, error } = useCollectionsQuery();

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      {data.map(collection => (
        <div key={collection.id}>{collection.name}</div>
      ))}
    </div>
  );
};

const setup = ({ error }: { error?: string } = {}) => {
  setupCollectionsEndpoints({ collections: [TEST_COLLECTION], error });

  renderWithProviders(<TestComponent />);
};

describe("useCollectionsQuery", () => {
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
});
