import userEvent from "@testing-library/user-event";
import { ComponentPropsWithoutRef } from "react";
import { IndexRoute, Route } from "react-router";
import fetchMock from "fetch-mock";
import { Card, Dataset, UnsavedCard } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockNativeDatasetQuery,
  createMockNativeQuery,
  createMockStructuredDatasetQuery,
  createMockStructuredQuery,
  createMockUnsavedCard,
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
  setupCardDataset,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
  setupTimelinesEndpoints,
  setupModelIndexEndpoints,
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
import { serializeCardForUrl } from "metabase/lib/card";
import QueryBuilder from "./QueryBuilder";

const TEST_DB = createSampleDatabase();

const TEST_CARD = createMockCard({
  id: 1,
  name: "Test card",
  dataset: true,
});

const TEST_CARD_VISUALIZATION = createMockCard({
  ...TEST_CARD,
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
    native: createMockNativeQuery({
      query: "SELECT 1",
    }),
  }),
});

const TEST_NATIVE_CARD_DATASET = createMockDataset({
  json_query: {
    database: SAMPLE_DB_ID,
    type: "native",
    native: {
      query: "SELECT 1",
    },
  },
  database_id: SAMPLE_DB_ID,
  status: "completed",
  row_count: 1,
  running_time: 35,
});

const TEST_UNSAVED_NATIVE_CARD = createMockUnsavedCard({
  dataset_query: createMockNativeDatasetQuery({
    database: SAMPLE_DB_ID,
  }),
});

const TEST_STRUCTURED_CARD = createMockCard({
  name: "Orders question",
  dataset_query: createMockStructuredDatasetQuery({
    database: SAMPLE_DB_ID,
    query: createMockStructuredQuery({
      "source-table": ORDERS_ID,
    }),
  }),
});

const TEST_UNSAVED_STRUCTURED_CARD = createMockUnsavedCard({
  dataset_query: createMockStructuredDatasetQuery({
    database: SAMPLE_DB_ID,
    query: createMockStructuredQuery({
      "source-table": ORDERS_ID,
    }),
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

function isSavedCard(card: Card | UnsavedCard): card is Card {
  return "id" in card;
}

interface SetupOpts {
  card?: Card | UnsavedCard;
  dataset?: Dataset;
  initialRoute?: string;
}

const setup = async ({
  card = TEST_CARD,
  dataset = createMockDataset(),
  initialRoute = `/question${
    isSavedCard(card) ? `/${card.id}` : `#${serializeCardForUrl(card)}`
  }`,
}: SetupOpts = {}) => {
  setupDatabasesEndpoints([TEST_DB]);
  setupCardDataset(dataset);
  setupSearchEndpoints([]);
  setupBookmarksEndpoints([]);
  setupTimelinesEndpoints([]);
  if (isSavedCard(card)) {
    setupCardEndpoints(card);
    setupCardQueryEndpoints(card, dataset);
    setupAlertsEndpoints(card, []);
    setupModelIndexEndpoints(card.id, []);
  }

  const mockEventListener = jest.spyOn(window, "addEventListener");

  renderWithProviders(
    <Route>
      <IndexRoute component={TestQueryBuilder} />
      <Route path="/model">
        <Route path=":slug/query" component={TestQueryBuilder} />
        <Route path=":slug/metadata" component={TestQueryBuilder} />
      </Route>
      <Route path="/question">
        <IndexRoute component={TestQueryBuilder} />
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
  describe("rendering", () => {
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

    describe("renders the row count regardless of visualization type", () => {
      const dataset = TEST_MODEL_DATASET;
      const cards = [
        createMockCard({ ...TEST_CARD_VISUALIZATION, display: "table" }),
        createMockCard({ ...TEST_CARD_VISUALIZATION, display: "line" }),
      ];

      it.each(cards)(
        `renders the row count in "$display" visualization`,
        async card => {
          await setup({
            card,
            dataset,
          });

          await waitFor(() => {
            const element = screen.getByTestId("question-row-count");
            expect(element).toBeInTheDocument();
          });

          const element = screen.getByTestId("question-row-count");
          expect(element).toBeVisible();
        },
      );
    });
  });

  describe("beforeunload events", () => {
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

          const columnDisplayName = await screen.findByTitle("Display name");

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

    describe("native queries", () => {
      afterEach(() => {
        jest.restoreAllMocks();
      });

      it("should trigger beforeunload event when leaving edited question", async () => {
        const { mockEventListener } = await setup({
          card: TEST_NATIVE_CARD,
        });

        const inputArea = within(
          screen.getByTestId("mock-native-query-editor"),
        ).getByRole("textbox");

        userEvent.click(inputArea);
        userEvent.type(inputArea, "0");

        userEvent.tab();

        // default native query is `SELECT 1`
        expect(inputArea).toHaveValue("SELECT 10");

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.preventDefault).toHaveBeenCalled();
        expect(mockEvent.returnValue).toEqual(BEFORE_UNLOAD_UNSAVED_MESSAGE);
      });

      it("should not trigger beforeunload event when user tries to leave an ad-hoc native query", async () => {
        const { mockEventListener } = await setup({
          card: TEST_UNSAVED_NATIVE_CARD,
        });

        const inputArea = within(
          screen.getByTestId("mock-native-query-editor"),
        ).getByRole("textbox");

        userEvent.click(inputArea);
        userEvent.type(inputArea, "0");

        userEvent.tab();

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockEvent.returnValue).not.toEqual(
          BEFORE_UNLOAD_UNSAVED_MESSAGE,
        );
      });

      it("should not trigger beforeunload event when query is unedited", async () => {
        const { mockEventListener } = await setup({
          card: TEST_NATIVE_CARD,
        });

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockEvent.returnValue).not.toEqual(
          BEFORE_UNLOAD_UNSAVED_MESSAGE,
        );
      });
    });

    describe("structured queries", () => {
      afterEach(() => {
        jest.restoreAllMocks();
      });

      it("should not trigger beforeunload event when leaving edited question which will turn the question ad-hoc", async () => {
        const { mockEventListener } = await setup({
          card: TEST_STRUCTURED_CARD,
        });

        expect(screen.queryByText("Count")).not.toBeInTheDocument();
        userEvent.click(await screen.findByText("Summarize"));
        userEvent.click(await screen.findByText("Done"));
        expect(await screen.findByText("Count")).toBeInTheDocument();

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockEvent.returnValue).not.toEqual(
          BEFORE_UNLOAD_UNSAVED_MESSAGE,
        );
      });

      it("should not trigger beforeunload event when user tries to leave an ad-hoc native query", async () => {
        const { mockEventListener } = await setup({
          card: TEST_UNSAVED_STRUCTURED_CARD,
        });

        expect(screen.queryByText("Count")).not.toBeInTheDocument();
        userEvent.click(await screen.findByText("Summarize"));
        userEvent.click(await screen.findByText("Done"));
        expect(await screen.findByText("Count")).toBeInTheDocument();

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockEvent.returnValue).not.toEqual(
          BEFORE_UNLOAD_UNSAVED_MESSAGE,
        );
      });

      it("should not trigger beforeunload event when query is unedited", async () => {
        const { mockEventListener } = await setup({
          card: TEST_STRUCTURED_CARD,
        });

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockEvent.returnValue).not.toEqual(
          BEFORE_UNLOAD_UNSAVED_MESSAGE,
        );
      });
    });
  });

  describe("downloading results", () => {
    // I initially planned to test unsaved native (ad-hoc) queries here as well.
    // But native queries won't run the query on first load, we need to manually
    // click the run button, but our mock `NativeQueryEditor` doesn't have a run
    // button wired up, and it's quite hard to do so (I've tried).
    // So I test that case in Cypress in `28834-modified-native-question.cy.spec.js` instead.

    it("should allow downloading results for a native query", async () => {
      const mockDownloadEndpoint = fetchMock.post(
        `/api/card/${TEST_NATIVE_CARD.id}/query/csv`,
        {},
      );
      await setup({
        card: TEST_NATIVE_CARD,
        dataset: TEST_NATIVE_CARD_DATASET,
      });

      const inputArea = within(
        screen.getByTestId("mock-native-query-editor"),
      ).getByRole("textbox");

      expect(inputArea).toHaveValue("SELECT 1");

      userEvent.click(screen.getByTestId("download-button"));
      userEvent.click(await screen.findByRole("button", { name: ".csv" }));

      expect(mockDownloadEndpoint.called()).toBe(true);
    });

    it("should allow downloading results for a native query using the current result even the query has changed but not rerun (metabase#28834)", async () => {
      const mockDownloadEndpoint = fetchMock.post("/api/dataset/csv", {});
      await setup({
        card: TEST_NATIVE_CARD,
        dataset: TEST_NATIVE_CARD_DATASET,
      });

      const inputArea = within(
        screen.getByTestId("mock-native-query-editor"),
      ).getByRole("textbox");

      userEvent.click(inputArea);
      userEvent.type(inputArea, " union SELECT 2");

      userEvent.tab();

      expect(inputArea).toHaveValue("SELECT 1 union SELECT 2");

      userEvent.click(screen.getByTestId("download-button"));
      userEvent.click(await screen.findByRole("button", { name: ".csv" }));

      expect(
        mockDownloadEndpoint.called((url, options) => {
          const { body: urlSearchParams } = options;
          const query =
            urlSearchParams instanceof URLSearchParams
              ? JSON.parse(urlSearchParams.get("query") ?? "{}")
              : {};
          return (
            url === "/api/dataset/csv" && query?.native.query === "SELECT 1"
          );
        }),
      ).toBe(true);
    });
  });
});
