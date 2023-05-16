import React, { ComponentPropsWithoutRef } from "react";
import { IndexRoute, Route } from "react-router";
import userEvent from "@testing-library/user-event";
import { Card, Dataset } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockNativeDatasetQuery,
} from "metabase-types/api/mocks";

import {
  createSampleDatabase,
  ORDERS,
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
  waitFor,
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

const TEST_MODEL_CARD = createMockCard({
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      limit: 1,
    },
  },
  dataset: true,
  display: "scalar",
  description: "Test description",
});

const TEST_NATIVE_CARD = createMockCard({
  dataset_query: createMockNativeDatasetQuery({
    database: SAMPLE_DB_ID,
  }),
});

const TEST_MODEL_DATASET_COLUMN = createMockColumn({
  name: "ID",
  source: "fields",
  display_name: "ID",
  description: "test",
  field_ref: ["field", ORDERS.ID, null],
});
const TEST_MODEL_DATASET = createMockDataset({
  data: {
    rows: [["1"]],
    cols: [TEST_MODEL_DATASET_COLUMN],
  },
  database_id: SAMPLE_DB_ID,

  status: "completed",
  context: "question",
  row_count: 1,
  running_time: 35,
});

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
  dataset?: Dataset;
  initialRoute?: string;
}

const setup = async ({
  card = TEST_CARD,
  dataset = createMockDataset(),
  initialRoute = `/question/${card.id}`,
}: SetupOpts = {}) => {
  setupDatabasesEndpoints([TEST_DB]);
  setupCardEndpoints(card);
  setupCardQueryEndpoints(card, dataset);
  setupSearchEndpoints([]);
  setupAlertsEndpoints(card, []);
  setupBookmarksEndpoints([]);
  setupTimelinesEndpoints([]);

  const mockEventListener = jest.spyOn(window, "addEventListener");

  renderWithProviders(
    <Route>
      <IndexRoute component={TestQueryBuilder} />
      <Route path="/model">
        <Route path=":slug/query" component={TestQueryBuilder} />
        <Route path=":slug/metadata" component={TestQueryBuilder} />
      </Route>
      <Route path="/question">
        <Route path="notebook" component={TestQueryBuilder} />
        <Route path=":slug" component={TestQueryBuilder} />
        <Route path=":slug/notebook" component={TestQueryBuilder} />
      </Route>
    </Route>,
    {
      withRouter: true,
      initialRoute,
    },
  );

  await waitForElementToBeRemoved(() =>
    screen.queryByTestId("loading-spinner"),
  );

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

  describe("editing models", () => {
    describe("editing queries", () => {
      afterEach(() => {
        jest.resetAllMocks();
      });

      it("should trigger beforeunload event when leaving edited query", async () => {
        const { mockEventListener } = await setup({
          card: TEST_MODEL_CARD,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/query`,
        });

        const rowLimitInput = await within(
          screen.getByTestId("step-limit-0-0"),
        ).findByPlaceholderText("Enter a limit");

        userEvent.click(rowLimitInput);
        userEvent.type(rowLimitInput, "0");

        await waitFor(() => {
          expect(rowLimitInput).toHaveValue(10);
        });

        userEvent.tab();

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");

        expect(mockEvent.preventDefault).toHaveBeenCalled();
        expect(mockEvent.returnValue).toBe(BEFORE_UNLOAD_UNSAVED_MESSAGE);
      });

      it("should not trigger beforeunload event when leaving unedited query", async () => {
        const { mockEventListener } = await setup({
          card: TEST_MODEL_CARD,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/query`,
        });

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockEvent.returnValue).toBe(undefined);
      });
    });

    describe("editing metadata", () => {
      afterEach(() => {
        jest.resetAllMocks();
      });

      it("should trigger beforeunload event when leaving edited metadata", async () => {
        const { mockEventListener } = await setup({
          card: TEST_MODEL_CARD,
          dataset: TEST_MODEL_DATASET,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/metadata`,
        });

        const columnDisplayName = screen.getByTitle("Display name");

        userEvent.click(columnDisplayName);
        userEvent.type(columnDisplayName, "X");

        await waitFor(() => {
          expect(columnDisplayName).toHaveValue(
            `${TEST_MODEL_DATASET_COLUMN.display_name}X`,
          );
        });

        userEvent.tab();

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockEvent.returnValue).toBe(undefined);
      });

      it("should not trigger beforeunload event when model metadata is unedited", async () => {
        const { mockEventListener } = await setup({
          card: TEST_MODEL_CARD,
          dataset: TEST_MODEL_DATASET,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/metadata`,
        });

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockEvent.returnValue).toBe(undefined);
      });
    });
  });

  describe("beforeunload events in native queries", () => {
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
