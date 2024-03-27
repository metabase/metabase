import {
  setupBookmarksEndpoints,
  setupBookmarksEndpointsWithError,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { createMockBookmark } from "metabase-types/api/mocks";

import { useBookmarkListQuery } from "./use-bookmark-list-query";

const TEST_BOOKMARK = createMockBookmark();

const TestComponent = () => {
  const { data = [], metadata, isLoading, error } = useBookmarkListQuery();

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      {data.map(bookmark => (
        <div key={bookmark.id}>{bookmark.name}</div>
      ))}
      <div data-testid="metadata">
        {(!metadata || Object.keys(metadata).length === 0) && "No metadata"}
      </div>
    </div>
  );
};

const setup = ({ error }: { error?: string } = {}) => {
  if (error) {
    setupBookmarksEndpointsWithError({ error });
  } else {
    setupBookmarksEndpoints([TEST_BOOKMARK]);
  }

  renderWithProviders(<TestComponent />);
};

describe("useBookmarkListQuery", () => {
  it("should be initially loading", () => {
    setup();

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });

  it("should display error", async () => {
    const ERROR = "Server error";

    setup({ error: ERROR });

    await waitForLoaderToBeRemoved();

    expect(screen.getByText(ERROR)).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();

    await waitForLoaderToBeRemoved();

    expect(screen.getByText(TEST_BOOKMARK.name)).toBeInTheDocument();
  });

  it("should not have any metadata in the response", async () => {
    setup();

    await waitForLoaderToBeRemoved();

    expect(
      within(screen.getByTestId("metadata")).getByText("No metadata"),
    ).toBeInTheDocument();
  });
});
