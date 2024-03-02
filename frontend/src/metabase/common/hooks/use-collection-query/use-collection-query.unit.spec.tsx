import {
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupCollectionsWithError,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { createMockCollection } from "metabase-types/api/mocks";

import { useCollectionQuery } from "./use-collection-query";

const TEST_COLLECTION = createMockCollection();

const TestComponent = () => {
  const { data, isLoading, error } = useCollectionQuery({
    id: TEST_COLLECTION.id,
  });

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <div>{data?.name}</div>;
};

const setup = ({ error }: { error?: string } = {}) => {
  if (error) {
    setupCollectionsWithError({ error });
  } else {
    setupCollectionsEndpoints({ collections: [TEST_COLLECTION] });
  }

  setupCollectionByIdEndpoint({ collections: [TEST_COLLECTION], error });

  renderWithProviders(<TestComponent />);
};

describe("useCollectionQuery", () => {
  it("should be initially loading", () => {
    setup();
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });

  it("should display error", async () => {
    const ERROR = "Server error";
    setup({
      error: ERROR,
    });

    await waitForLoaderToBeRemoved();

    expect(screen.getByText(ERROR)).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();

    await waitForLoaderToBeRemoved();

    expect(screen.getByText(TEST_COLLECTION.name)).toBeInTheDocument();
  });
});
