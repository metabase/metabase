import React from "react";
import fetchMock from "fetch-mock";

import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
  act,
} from "__support__/ui";
import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import { BEFORE_UNLOAD_UNSAVED_MESSAGE } from "metabase/hooks/use-before-unload";
import { callMockEvent } from "__support__/events";
import {
  createMockCard,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  setupCardsEndpoints,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { Card } from "metabase-types/api";
import {
  createSampleDatabase,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase-types/store/mocks";

jest.mock("metabase/components/PopoverWithTrigger");

const TEST_DATABASE = createSampleDatabase();

const TEST_CARD_ID = 1;
const TEST_TABLE_ID = ORDERS_ID;
const TEST_DATABASE_ID = TEST_DATABASE.id;

const TEST_CARD = createMockCard({
  id: TEST_CARD_ID,
  dataset_query: createMockStructuredDatasetQuery({
    query: { "source-table": TEST_TABLE_ID },
    database: TEST_DATABASE_ID,
    type: "query",
  }),
  dataset: true,
  database_id: TEST_DATABASE_ID,
});

const NEW_TEST_CARD = createMockCard({
  id: 0,
  dataset_query: createMockStructuredDatasetQuery({
    query: { "source-table": TEST_TABLE_ID },
    database: TEST_DATABASE_ID,
    type: "query",
  }),
  dataset: true,
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
      storeInitialState: createMockState({
        qb: createMockQueryBuilderState({
          originalCard: TEST_CARD,

          // OISIN REMOVE:
          // isDirty within the QueryBuilder seems to be relying on the state
          // between the card and the lastRunCard, so they need to stay the
          // same from the start or the beforeunload hook will trigger when
          // we don't want it.
          card: {
            original_card_id: TEST_CARD_ID,
            dataset_query: TEST_CARD.dataset_query,
            dataset: true,
            display: "table",
            visualization_settings: {},
          },
          lastRunCard: {
            original_card_id: TEST_CARD_ID,
            dataset_query: TEST_CARD.dataset_query,
            dataset: true,
            display: "table",
            visualization_settings: {},
          },
          currentState: {
            cardId: TEST_CARD_ID,
            card: TEST_CARD,
            serializedCard: "",
          },
        }),
      }),
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

    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      screen.getByText("Row limit").click();
      const rowLimitInputElem = await screen.findByPlaceholderText(
        "Enter a limit",
      );
      rowLimitInputElem.click();
      await userEvent.type(rowLimitInputElem, "100");
      userEvent.tab();
    });

    const mockEvent = callMockEvent(mockEventListener, "beforeunload");
    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockEvent.returnValue).toBe(BEFORE_UNLOAD_UNSAVED_MESSAGE);
  });

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
