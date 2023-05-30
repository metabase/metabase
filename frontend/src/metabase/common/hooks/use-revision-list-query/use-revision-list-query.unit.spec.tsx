import React from "react";

import { setupRevisionsEndpoints } from "__support__/server-mocks/revision";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import { createMockRevision } from "metabase-types/api/mocks/revision";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";

import { useRevisionListQuery } from "./use-revision-list-query";

const TEST_REVISION = createMockRevision();

function TestComponent() {
  const { data = [], isLoading, error } = useRevisionListQuery();

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      {data.map(revision => (
        <div key={revision.id}>{revision.description}</div>
      ))}
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
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    expect(screen.getByText(TEST_REVISION.description)).toBeInTheDocument();
  });
});
