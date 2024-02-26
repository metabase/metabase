import { setupRevisionsEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";
import { createMockRevision } from "metabase-types/api/mocks/revision";

import { useRevisionListQuery } from "./use-revision-list-query";

const TEST_REVISION = createMockRevision();

function TestComponent() {
  const { data = [], metadata, isLoading, error } = useRevisionListQuery();

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      {data.map(revision => (
        <div key={revision.id}>{revision.description}</div>
      ))}

      <div data-testid="metadata">
        {(!metadata || Object.keys(metadata).length === 0) && "No metadata"}
      </div>
    </div>
  );
}

function setup() {
  setupRevisionsEndpoints([TEST_REVISION]);
  renderWithProviders(<TestComponent />);
}

describe("useRevisionListQuery", () => {
  it("should be initially loading", () => {
    setup();
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(screen.getByText(TEST_REVISION.description)).toBeInTheDocument();
  });

  it("should not have any metadata in the response", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(
      within(screen.getByTestId("metadata")).getByText("No metadata"),
    ).toBeInTheDocument();
  });
});
