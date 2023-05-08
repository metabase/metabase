import React, { ComponentPropsWithoutRef } from "react";
import { IndexRoute, Route } from "react-router";
import userEvent from "@testing-library/user-event";

import { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockDataset,
  createMockNativeDatasetQuery,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import {
  setupAlertsEndpoints,
  setupBookmarksEndpoints,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
  setupTimelinesEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
  within,
} from "__support__/ui";
import { callMockEvent } from "__support__/events";
import { BEFORE_UNLOAD_UNSAVED_MESSAGE } from "metabase/hooks/use-before-unload";
import QueryBuilder from "./QueryBuilder";

const TEST_DB = createSampleDatabase();

const TEST_CARD = createMockCard({
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
    },
  },
});

const TEST_NATIVE_CARD = createMockCard({
  dataset_query: createMockNativeDatasetQuery({
    database: SAMPLE_DB_ID,
  }),
});

const TEST_DATASET = createMockDataset();

const TestQueryBuilder = (
  props: ComponentPropsWithoutRef<typeof QueryBuilder>,
) => {
  return (
    <div>
      <link rel="icon" />
      <QueryBuilder {...props} />
    </div>
  );
};

interface SetupOpts {
  card?: Card;
  initialRoute?: string;
}

const setup = async ({
  card = TEST_CARD,
  initialRoute = `/question/${card.id}`,
}: SetupOpts = {}) => {
  setupDatabasesEndpoints([TEST_DB]);
  setupCardEndpoints(card);
  setupCardQueryEndpoints(card, TEST_DATASET);
  setupSearchEndpoints([]);
  setupAlertsEndpoints(card, []);
  setupBookmarksEndpoints([]);
  setupTimelinesEndpoints([]);

  const mockEventListener = jest.spyOn(window, "addEventListener");

  renderWithProviders(
    <Route path="/question">
      <IndexRoute component={TestQueryBuilder} />
      <Route path="notebook" component={TestQueryBuilder} />
      <Route path=":slug" component={TestQueryBuilder} />
      <Route path=":slug/notebook" component={TestQueryBuilder} />
    </Route>,
    {
      withRouter: true,
      initialRoute,
    },
  );

  await waitForElementToBeRemoved(() => screen.queryByText(/Loading/));

  return { mockEventListener };
};

describe("QueryBuilder", () => {
  describe("renders structured queries", () => {
    it("renders a structured question in the simple mode", async () => {
      await setup();

      expect(screen.getByDisplayValue(TEST_CARD.name)).toBeInTheDocument();
    });

    it("renders a structured question in the notebook mode", async () => {
      await setup({
        initialRoute: `/question/${TEST_CARD.id}/notebook`,
      });

      expect(screen.getByDisplayValue(TEST_CARD.name)).toBeInTheDocument();
    });
  });

  describe("beforeunload events", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("triggers beforeunload event when user tries to leave edited native query", async () => {
      const { mockEventListener } = await setup({
        card: TEST_NATIVE_CARD,
        initialRoute: `/question/${TEST_NATIVE_CARD.id}`,
      });

      const inputArea = within(
        screen.getByTestId("mock-native-query-editor"),
      ).getByRole("textbox");

      userEvent.click(inputArea);
      userEvent.type(inputArea, " ");

      const mockEvent = callMockEvent(mockEventListener, "beforeunload");
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.returnValue).toEqual(BEFORE_UNLOAD_UNSAVED_MESSAGE);
    });

    it("should not trigger beforeunload event when query is unedited", async () => {
      const { mockEventListener } = await setup({
        card: TEST_NATIVE_CARD,
        initialRoute: `/question/${TEST_NATIVE_CARD.id}`,
      });

      const mockEvent = callMockEvent(mockEventListener, "beforeunload");
      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
      expect(mockEvent.returnValue).not.toEqual(BEFORE_UNLOAD_UNSAVED_MESSAGE);
    });
  });
});
