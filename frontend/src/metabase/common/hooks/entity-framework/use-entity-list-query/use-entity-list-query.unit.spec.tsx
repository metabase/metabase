import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupCardsEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Questions } from "metabase/entities/questions";
import { useDispatch } from "metabase/redux";
import { delay } from "metabase/utils/promise";
import type Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";

import { useEntityListQuery } from "./use-entity-list-query";

const TEST_CARD = createMockCard();

const TestComponent = ({
  reload,
  testId,
}: {
  reload?: boolean;
  testId?: string;
}) => {
  const {
    data = [],
    isLoading,
    error,
  } = useEntityListQuery<Question>(
    { reload },
    {
      fetchList: Questions.actions.fetchList,
      getList: Questions.selectors.getList,
      getLoading: Questions.selectors.getLoading,
      getLoaded: Questions.selectors.getLoaded,
      getError: Questions.selectors.getError,
      getListMetadata: Questions.selectors.getListMetadata,
    },
  );

  const dispatch = useDispatch();
  const handleInvalidate = () => dispatch(Questions.actions.invalidateLists());

  if (isLoading || error) {
    return (
      <LoadingAndErrorWrapper
        loading={isLoading}
        error={error}
        data-testid={testId}
      />
    );
  }

  return (
    <div data-testid={testId}>
      <button onClick={handleInvalidate}>Invalidate questions</button>
      {data.map((question) => (
        <div key={question.id()}>{question.displayName()}</div>
      ))}
    </div>
  );
};

const setup = ({ reload }: { reload?: boolean } = {}) => {
  setupCardsEndpoints([TEST_CARD]);
  return renderWithProviders(<TestComponent reload={reload} />);
};

describe("useEntityListQuery", () => {
  it("should be initially loading", async () => {
    setup();

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();

    // Let the pending list requests settle so their state updates stay
    // wrapped in act instead of leaking into the next test.
    await waitForLoaderToBeRemoved();
  });

  it("should load data only once", async () => {
    setup();

    await waitForLoaderToBeRemoved();

    expect(screen.getByText(TEST_CARD.name)).toBeInTheDocument();
    expect(fetchMock.callHistory.calls("path:/api/card")).toHaveLength(1);
  });

  it("should not reload data when re-rendered", async () => {
    const { rerender } = setup();

    await waitForLoaderToBeRemoved();
    rerender(<TestComponent />);

    expect(screen.getByText(TEST_CARD.name)).toBeInTheDocument();
    expect(fetchMock.callHistory.calls("path:/api/card")).toHaveLength(1);
  });

  it("should not reload data when re-mounted without the reload flag", async () => {
    const { rerender } = setup();

    await waitForLoaderToBeRemoved();
    rerender(<div />);
    rerender(<TestComponent />);
    await waitForLoaderToBeRemoved();

    expect(screen.getByText(TEST_CARD.name)).toBeInTheDocument();
    expect(fetchMock.callHistory.calls("path:/api/card")).toHaveLength(1);
  });

  it("should reload data when re-mounted with the reload flag", async () => {
    const { rerender } = setup({ reload: true });

    await waitForLoaderToBeRemoved();
    rerender(<div />);
    rerender(<TestComponent reload />);
    await waitForLoaderToBeRemoved();

    expect(screen.getByText(TEST_CARD.name)).toBeInTheDocument();
    expect(fetchMock.callHistory.calls("path:/api/card")).toHaveLength(2);
  });

  it("should reload data when explicitly invalidated", async () => {
    setup();

    await waitForLoaderToBeRemoved();
    await userEvent.click(screen.getByText("Invalidate questions"));

    await waitFor(() => {
      expect(fetchMock.callHistory.calls("path:/api/card")).toHaveLength(2);
    });
    expect(await screen.findByText(TEST_CARD.name)).toBeInTheDocument();
  });

  it("should not remove loader in case second api call is cached", async () => {
    const { rerender } = setup();
    fetchMock.modifyRoute("cards-list", {
      response: async () => {
        await delay(100);
        return [TEST_CARD];
      },
    });
    await waitFor(() => {
      expect(fetchMock.callHistory.calls("path:/api/card")).toHaveLength(1);
    });

    rerender(
      <>
        <TestComponent />
        <TestComponent testId="test2" />
      </>,
    );

    // second component should not create extra request, make sure that caching works as expected
    expect(fetchMock.callHistory.calls("path:/api/card")).toHaveLength(1);

    expect(
      within(screen.getByTestId("test2")).getByTestId("loading-indicator"),
    ).toBeInTheDocument();

    // Wait for the delayed (cached) request to resolve. Using waitFor keeps the
    // resulting state updates wrapped in act, unlike a bare delay.
    await waitForLoaderToBeRemoved();

    expect(fetchMock.callHistory.calls("path:/api/card")).toHaveLength(1);
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
  });
});
