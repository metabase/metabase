import fetchMock from "fetch-mock";

import {
  setupCardEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Questions } from "metabase/entities/questions";
import { Tables } from "metabase/entities/tables";
import type Question from "metabase-lib/v1/Question";
import type Table from "metabase-lib/v1/metadata/Table";
import type { CardId, TableId } from "metabase-types/api";
import { createMockCard, createMockTable } from "metabase-types/api/mocks";

import { useEntityQuery } from "./use-entity-query";

const TEST_CARD = createMockCard();
const TEST_TABLE = createMockTable();

const TestComponent = () => {
  const {
    data: question,
    isLoading,
    error,
  } = useEntityQuery<CardId, Question>(
    {
      id: TEST_CARD.id,
    },
    {
      fetch: Questions.actions.fetch,
      getObject: Questions.selectors.getObject,
      getLoading: Questions.selectors.getLoading,
      getError: Questions.selectors.getError,
    },
  );

  if (isLoading || error || !question) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      <div>{question.displayName()}</div>
      <TestInnerComponent />
    </div>
  );
};

const TestInnerComponent = () => {
  const {
    data: table,
    isLoading,
    error,
  } = useEntityQuery<TableId, Table>(
    {
      id: TEST_TABLE.id,
      reload: true,
    },
    {
      fetch: Tables.actions.fetch,
      getObject: Tables.selectors.getObject,
      getLoading: Tables.selectors.getLoading,
      getError: Tables.selectors.getError,
    },
  );

  if (isLoading || error || !table) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <div>{table.name}</div>;
};

const setup = () => {
  setupCardEndpoints(TEST_CARD);
  setupTableEndpoints(TEST_TABLE);
  return renderWithProviders(<TestComponent />);
};

describe("useEntityQuery", () => {
  it("should be initially loading", () => {
    setup();

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
  });

  it("should initially load data only once the reload flag", async () => {
    setup();

    await waitForLoaderToBeRemoved();

    expect(screen.getByText(TEST_CARD.name)).toBeInTheDocument();
    expect(screen.getByText(TEST_TABLE.name)).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls(`path:/api/card/${TEST_CARD.id}`),
    ).toHaveLength(1);
    expect(
      fetchMock.callHistory.calls(`path:/api/table/${TEST_TABLE.id}`),
    ).toHaveLength(1);
  });

  it("should not reload data when re-rendered", async () => {
    const { rerender } = setup();

    await waitForLoaderToBeRemoved();
    rerender(<TestComponent />);

    expect(screen.getByText(TEST_CARD.name)).toBeInTheDocument();
    expect(screen.getByText(TEST_TABLE.name)).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls(`path:/api/card/${TEST_CARD.id}`),
    ).toHaveLength(1);
    expect(
      fetchMock.callHistory.calls(`path:/api/table/${TEST_TABLE.id}`),
    ).toHaveLength(1);
  });

  it("should reload data only for calls with the reload flag when re-mounted", async () => {
    const { rerender } = setup();

    await waitForLoaderToBeRemoved();
    rerender(<div />);
    rerender(<TestComponent />);
    await waitForLoaderToBeRemoved();

    expect(screen.getByText(TEST_CARD.name)).toBeInTheDocument();
    expect(screen.getByText(TEST_TABLE.name)).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls(`path:/api/card/${TEST_CARD.id}`),
    ).toHaveLength(1);
    expect(
      fetchMock.callHistory.calls(`path:/api/table/${TEST_TABLE.id}`),
    ).toHaveLength(2);
  });
});
