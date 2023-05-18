import React from "react";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { createMockCard } from "metabase-types/api/mocks";
import { setupCardsEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import { useQuestionQuery } from "./use-question-query";

const TEST_CARD = createMockCard();

const TestComponent = () => {
  const { data, isLoading, error } = useQuestionQuery({
    id: TEST_CARD.id,
  });

  if (isLoading || error || !data) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <div>{data.displayName()}</div>;
};

const setup = () => {
  setupCardsEndpoints([TEST_CARD]);
  renderWithProviders(<TestComponent />);
};

describe("useQuestionQuery", () => {
  it("should be initially loading", () => {
    setup();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    expect(screen.getByText(TEST_CARD.name)).toBeInTheDocument();
  });
});
