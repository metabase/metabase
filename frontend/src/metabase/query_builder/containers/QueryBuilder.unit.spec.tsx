import React from "react";
import fetchMock from "fetch-mock";

import userEvent from "@testing-library/user-event";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";

import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import { Route } from "metabase/hoc/Title";
import { BEFORE_UNLOAD_UNSAVED_MESSAGE } from "metabase/hooks/use-before-unload";
import { callMockEvent } from "__support__/events";
import {
  createMockCard,
  createMockDatabase,
  createMockStructuredDatasetQuery,
  createMockTable,
} from "metabase-types/api/mocks";
import {
  setupCardsEndpoints,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { Card } from "metabase-types/api";

jest.mock("metabase/components/PopoverWithTrigger");

const TEST_CARD_ID = 1;
const TEST_DATABASE_ID = 1;
const TEST_TABLE_ID = 1;

const TEST_CARD = createMockCard({
  id: TEST_CARD_ID,
  dataset_query: createMockStructuredDatasetQuery({
    query: { "source-table": TEST_TABLE_ID },
    database: TEST_DATABASE_ID,
  }),
  dataset: true,
});

const NEW_TEST_CARD = createMockCard({
  id: 0,
  dataset_query: createMockStructuredDatasetQuery({
    query: { "source-table": TEST_TABLE_ID },
    database: TEST_DATABASE_ID,
  }),
  dataset: true,
});

const TEST_TABLE = createMockTable({
  id: TEST_TABLE_ID,
  db_id: TEST_DATABASE_ID,
});

const TEST_DATABASE = createMockDatabase({
  id: TEST_DATABASE_ID,
  tables: [TEST_TABLE],
});

type QBSpecSetupProps = {
  mockCard: Card;
};

const setup = async ({ mockCard }: QBSpecSetupProps) => {
  fetchMock.get(`path:/api/alert/question/${mockCard.id}`, []);
  fetchMock.get("path:/api/bookmark", []);
  fetchMock.get("path:/api/timeline", []);

  setupCardsEndpoints([mockCard]);
  setupDatabasesEndpoints([TEST_DATABASE]);
  setupSearchEndpoints([]);

  fetchMock.post(`path:/api/card/${mockCard.id}/query`, {
    data: { rows: [], cols: [] },
  });

  const mockEventListener = jest.spyOn(window, "addEventListener");

  const QueryBuilderContainer = (
    props: React.ComponentProps<typeof QueryBuilder>,
  ) => (
    <div>
      <link rel="icon" />
      <QueryBuilder {...props} />
    </div>
  );

  renderWithProviders(
    <Route path="/model/:slug/query" component={QueryBuilderContainer} />,
    {
      withRouter: true,
      initialRoute: `/model/${mockCard.id}/query`,
    },
  );

  await waitForElementToBeRemoved(() =>
    screen.queryAllByTestId("loading-spinner"),
  );

  return { mockEventListener };
};

describe("QueryBuilder", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it("should have beforeunload event when user tries to leave an edited existing model", async () => {
    const { mockEventListener } = await setup({ mockCard: TEST_CARD });

    screen.getByText("Row limit").click();
    const rowLimitInputElem = screen.getByPlaceholderText("Enter a limit");
    rowLimitInputElem.click();
    userEvent.type(rowLimitInputElem, "100");
    userEvent.tab();

    const mockEvent = callMockEvent(mockEventListener, "beforeunload");
    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockEvent.returnValue).toBe(BEFORE_UNLOAD_UNSAVED_MESSAGE);
  });

  /*
   * Problem: the event is firing because the lastRunQuestion is being updated after
   * the currentQuestion in `query_builder/selectors.js -> areQueriesEquivalent`.
   *
   * This causes a split moment where QueryBuilder.isResultDirty is true, which causes
   * the preventDefault function to get called, and sets the mockEvent.returnValue to
   * the BEFORE_UNLOAD_UNSAVED_MESSAGE.
   *
   * One way to fix this is to add storeInitialState to the renderWithProviders
   * function and set lastRunCard and currentCard to the same value.
   * */
  it("should not have beforeunload event when user leaves unedited, existing model", async () => {
    const { mockEventListener } = await setup({ mockCard: TEST_CARD });

    const mockEvent = callMockEvent(mockEventListener, "beforeunload");
    expect(mockEvent.returnValue).toBe(undefined);
  });

  it("should not have beforeunload event when user leaves a new model", async () => {
    const { mockEventListener } = await setup({ mockCard: NEW_TEST_CARD });

    const mockEvent = callMockEvent(mockEventListener, "beforeunload");
    expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    expect(mockEvent.returnValue).toBe(undefined);
  });
});
