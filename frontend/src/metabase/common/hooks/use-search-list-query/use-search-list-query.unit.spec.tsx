import React from "react";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { createMockCollectionItem } from "metabase-types/api/mocks";
import { setupSearchEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import { useSearchListQuery } from "./use-search-list-query";

const TEST_ITEM = createMockCollectionItem();

const TestComponent = () => {
  const {
    data = [],
    isLoading,
    error,
  } = useSearchListQuery({
    query: { models: TEST_ITEM.model },
  });

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      {data.map(item => (
        <div key={item.id}>{item.name}</div>
      ))}
    </div>
  );
};

const setup = () => {
  setupSearchEndpoints([TEST_ITEM]);
  renderWithProviders(<TestComponent />);
};

describe("useSearchListQuery", () => {
  it("should be initially loading", () => {
    setup();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    expect(screen.getByText(TEST_ITEM.name)).toBeInTheDocument();
  });
});
