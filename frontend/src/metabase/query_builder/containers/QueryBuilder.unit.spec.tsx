import userEvent from "@testing-library/user-event";
import type { ComponentPropsWithoutRef } from "react";
import { IndexRoute, Route } from "react-router";
import fetchMock from "fetch-mock";
import type { Card, Dataset, UnsavedCard } from "metabase-types/api";
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

import registerVisualizations from "metabase/visualizations/register";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import { checkNotNull } from "metabase/core/utils/types";
import {
  setupAlertsEndpoints,
  setupBookmarksEndpoints,
  setupCardDataset,
  setupCardsEndpoints,
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
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { callMockEvent } from "__support__/events";
import { BEFORE_UNLOAD_UNSAVED_MESSAGE } from "metabase/hooks/use-before-unload";
import { serializeCardForUrl } from "metabase/lib/card";
import QueryBuilder from "./QueryBuilder";

registerVisualizations();

const TEST_DB = createSampleDatabase();

const TEST_CARD = createMockCard({
  id: 1,
  name: "Test card",
  dataset: true,
});

const TEST_TIME_SERIES_WITH_DATE_BREAKOUT_CARD = createMockCard({
  ...TEST_CARD,
  dataset: false,
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, null]],
    },
  },
});

const TEST_TIME_SERIES_WITH_CUSTOM_DATE_BREAKOUT_CARD = createMockCard({
  ...TEST_CARD,
  dataset: false,
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["expression", "Custom Created At"]],
      expressions: {
        "Custom Created At": ["field", ORDERS.CREATED_AT, null],
      },
    },
  },
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

const TEST_MODEL_CARD_SLUG = [
  TEST_MODEL_CARD.id,
  TEST_MODEL_CARD.name.toLowerCase(),
].join("-");

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

const TestHome = () => <div />;

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
    setupCardsEndpoints([card]);
    setupCardQueryEndpoints(card, dataset);
    setupAlertsEndpoints(card, []);
    setupModelIndexEndpoints(card.id, []);
  }

  const mockEventListener = jest.spyOn(window, "addEventListener");

  const { history } = renderWithProviders(
    <Route>
      <Route path="/home" component={TestHome} />
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

  await waitForLoaderToBeRemoved();

  return {
    history: checkNotNull(history),
    mockEventListener,
  };
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

      it("renders time series grouping widget for date field breakout", async () => {
        await setup({
          card: TEST_TIME_SERIES_WITH_DATE_BREAKOUT_CARD,
        });
        const timeSeriesModeFooter = await screen.findByTestId(
          "time-series-mode-footer",
        );
        expect(timeSeriesModeFooter).toBeInTheDocument();
        expect(
          within(timeSeriesModeFooter).getByText("by"),
        ).toBeInTheDocument();
        expect(
          within(timeSeriesModeFooter).getByTestId(
            "time-series-grouping-select-button",
          ),
        ).toBeInTheDocument();
      });

      it("doesn't render time series grouping widget for custom date field breakout (metabase#33504)", async () => {
        await setup({
          card: TEST_TIME_SERIES_WITH_CUSTOM_DATE_BREAKOUT_CARD,
        });

        const timeSeriesModeFooter = await screen.findByTestId(
          "time-series-mode-footer",
        );
        expect(timeSeriesModeFooter).toBeInTheDocument();
        expect(
          within(timeSeriesModeFooter).queryByText("by"),
        ).not.toBeInTheDocument();
        expect(
          within(timeSeriesModeFooter).queryByTestId(
            "time-series-grouping-select-button",
          ),
        ).not.toBeInTheDocument();
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

          await waitFor(() => {
            expect(
              screen.getByRole("button", { name: "Save changes" }),
            ).toBeEnabled();
          });

          const mockEvent = callMockEvent(mockEventListener, "beforeunload");
          expect(mockEvent.preventDefault).toHaveBeenCalled();
          expect(mockEvent.returnValue).toBe(BEFORE_UNLOAD_UNSAVED_MESSAGE);
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

      it("should not trigger beforeunload event when user tries to leave an ad-hoc structured query", async () => {
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

  describe("unsaved changes warning", () => {
    describe("editing models", () => {
      describe("editing queries", () => {
        it("shows custom warning modal when leaving edited query via SPA navigation", async () => {
          const { history } = await setup({
            card: TEST_MODEL_CARD,
            initialRoute: "/home",
          });

          history.push(`/model/${TEST_MODEL_CARD.id}/query`);

          await waitForLoaderToBeRemoved();

          const rowLimitInput = await within(
            screen.getByTestId("step-limit-0-0"),
          ).findByPlaceholderText("Enter a limit");

          userEvent.click(rowLimitInput);
          userEvent.type(rowLimitInput, "0");

          await waitFor(() => {
            expect(rowLimitInput).toHaveValue(10);
          });

          userEvent.tab();

          history.goBack();

          expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
        });

        it("does not show custom warning modal when leaving unedited query via SPA navigation", async () => {
          const { history } = await setup({
            card: TEST_MODEL_CARD,
            initialRoute: "/home",
          });

          history.push(`/model/${TEST_MODEL_CARD.id}/query`);

          await waitForLoaderToBeRemoved();

          const rowLimitInput = await within(
            screen.getByTestId("step-limit-0-0"),
          ).findByPlaceholderText("Enter a limit");

          userEvent.click(rowLimitInput);
          userEvent.type(rowLimitInput, "0");
          userEvent.tab();

          userEvent.click(rowLimitInput);
          userEvent.type(rowLimitInput, "{backspace}");
          userEvent.tab();

          history.goBack();

          expect(
            screen.queryByTestId("leave-confirmation"),
          ).not.toBeInTheDocument();
        });

        it("does not show custom warning modal when saving edited query", async () => {
          const { history } = await setup({
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

          await waitFor(() => {
            expect(
              screen.getByRole("button", { name: "Save changes" }),
            ).toBeEnabled();
          });

          userEvent.click(screen.getByRole("button", { name: "Save changes" }));

          await waitFor(() => {
            expect(history.getCurrentLocation().pathname).toEqual(
              `/model/${TEST_MODEL_CARD_SLUG}`,
            );
          });

          expect(
            screen.queryByTestId("leave-confirmation"),
          ).not.toBeInTheDocument();
        });
      });

      describe("editing metadata", () => {
        it("shows custom warning modal when leaving edited metadata via SPA navigation", async () => {
          const { history } = await setup({
            card: TEST_MODEL_CARD,
            dataset: TEST_MODEL_DATASET,
            initialRoute: "/home",
          });

          history.push(`/model/${TEST_MODEL_CARD.id}/metadata`);

          await waitForLoaderToBeRemoved();

          const columnDisplayName = await screen.findByTitle("Display name");

          userEvent.click(columnDisplayName);
          userEvent.type(columnDisplayName, "X");

          await waitFor(() => {
            expect(columnDisplayName).toHaveValue(
              `${TEST_MODEL_DATASET_COLUMN.display_name}X`,
            );
          });

          userEvent.tab();

          await waitFor(() => {
            expect(
              screen.getByRole("button", { name: "Save changes" }),
            ).toBeEnabled();
          });

          history.goBack();

          expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
        });

        it("does not show custom warning modal when leaving unedited metadata via SPA navigation", async () => {
          const { history } = await setup({
            card: TEST_MODEL_CARD,
            dataset: TEST_MODEL_DATASET,
            initialRoute: "/home",
          });

          history.push(`/model/${TEST_MODEL_CARD.id}/metadata`);

          await waitForLoaderToBeRemoved();

          const columnDisplayName = await screen.findByTitle("Display name");

          userEvent.click(columnDisplayName);
          userEvent.type(columnDisplayName, "X");

          await waitFor(() => {
            expect(columnDisplayName).toHaveValue(
              `${TEST_MODEL_DATASET_COLUMN.display_name}X`,
            );
          });

          userEvent.tab();

          userEvent.click(columnDisplayName);
          userEvent.type(columnDisplayName, "{backspace}");

          await waitFor(() => {
            expect(columnDisplayName).toHaveValue(
              TEST_MODEL_DATASET_COLUMN.display_name,
            );
          });

          userEvent.tab();

          await waitFor(() => {
            expect(
              screen.getByRole("button", { name: "Save changes" }),
            ).toBeDisabled();
          });

          history.goBack();

          expect(
            screen.queryByTestId("leave-confirmation"),
          ).not.toBeInTheDocument();
        });

        it("does not show custom warning modal when saving edited metadata", async () => {
          const { history } = await setup({
            card: TEST_MODEL_CARD,
            dataset: TEST_MODEL_DATASET,
            initialRoute: `/model/${TEST_MODEL_CARD.id}/query`,
          });

          /**
           * When initialRoute is `/model/${TEST_MODEL_CARD.id}/metadata`,
           * the QueryBuilder gets incompletely intialized.
           * This seems to affect only tests.
           */
          userEvent.click(screen.getByText("Metadata"));

          const columnDisplayName = await screen.findByTitle("Display name");

          userEvent.click(columnDisplayName);
          userEvent.type(columnDisplayName, "X");

          await waitFor(() => {
            expect(columnDisplayName).toHaveValue(
              `${TEST_MODEL_DATASET_COLUMN.display_name}X`,
            );
          });

          userEvent.tab();

          await waitFor(() => {
            expect(
              screen.getByRole("button", { name: "Save changes" }),
            ).toBeEnabled();
          });

          userEvent.click(screen.getByRole("button", { name: "Save changes" }));

          await waitFor(() => {
            expect(history.getCurrentLocation().pathname).toEqual(
              `/model/${TEST_MODEL_CARD_SLUG}`,
            );
          });

          expect(
            screen.queryByTestId("leave-confirmation"),
          ).not.toBeInTheDocument();
        });
      });

      it("does not show custom warning modal when navigating between tabs with unsaved changes", async () => {
        await setup({
          card: TEST_MODEL_CARD,
          dataset: TEST_MODEL_DATASET,
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

        userEvent.click(screen.getByTestId("editor-tabs-metadata-name"));

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();

        const columnDisplayName = await screen.findByTitle("Display name");

        userEvent.click(columnDisplayName);
        userEvent.type(columnDisplayName, "X");

        await waitFor(() => {
          expect(columnDisplayName).toHaveValue(
            `${TEST_MODEL_DATASET_COLUMN.display_name}X`,
          );
        });

        userEvent.tab();

        userEvent.click(screen.getByTestId("editor-tabs-query-name"));

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });
    });

    describe("native queries", () => {
      it("shows custom warning modal when leaving edited question via SPA navigation", async () => {
        const { history } = await setup({
          card: TEST_NATIVE_CARD,
          initialRoute: "/home",
        });

        history.push(`/question/${TEST_NATIVE_CARD.id}`);

        await waitFor(() => {
          expect(
            screen.getByTestId("mock-native-query-editor"),
          ).toBeInTheDocument();
        });

        const inputArea = within(
          screen.getByTestId("mock-native-query-editor"),
        ).getByRole("textbox");

        userEvent.click(inputArea);
        userEvent.type(inputArea, "0");
        userEvent.tab();

        history.goBack();

        expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
      });

      it("does not show custom warning modal leaving with no changes via SPA navigation", async () => {
        const { history } = await setup({
          card: TEST_NATIVE_CARD,
          initialRoute: "/home",
        });

        history.push(`/question/${TEST_NATIVE_CARD.id}`);

        await waitFor(() => {
          expect(
            screen.getByTestId("mock-native-query-editor"),
          ).toBeInTheDocument();
        });

        history.goBack();

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });

      it("does not show custom warning modal when running edited question", async () => {
        const { history } = await setup({
          card: TEST_NATIVE_CARD,
          initialRoute: "/home",
        });

        history.push(`/question/${TEST_NATIVE_CARD.id}`);

        await waitFor(() => {
          expect(
            screen.getByTestId("mock-native-query-editor"),
          ).toBeInTheDocument();
        });

        const inputArea = within(
          screen.getByTestId("mock-native-query-editor"),
        ).getByRole("textbox");

        userEvent.click(inputArea);
        userEvent.type(inputArea, "0");
        userEvent.tab();

        userEvent.click(
          within(screen.getByTestId("query-builder-main")).getByRole("button", {
            name: "Get Answer",
          }),
        );

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });

      it("does not show custom warning modal when saving edited question", async () => {
        const { history } = await setup({
          card: TEST_NATIVE_CARD,
          initialRoute: "/home",
        });

        history.push(`/question/${TEST_NATIVE_CARD.id}`);

        await waitFor(() => {
          expect(
            screen.getByTestId("mock-native-query-editor"),
          ).toBeInTheDocument();
        });

        const inputArea = within(
          screen.getByTestId("mock-native-query-editor"),
        ).getByRole("textbox");

        userEvent.click(inputArea);
        userEvent.type(inputArea, "0");
        userEvent.tab();

        userEvent.click(screen.getByText("Save"));

        userEvent.click(
          within(screen.getByTestId("save-question-modal")).getByRole(
            "button",
            { name: "Save" },
          ),
        );

        await waitFor(() => {
          expect(
            screen.queryByTestId("save-question-modal"),
          ).not.toBeInTheDocument();
        });

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });

      it("does not show custom warning modal when saving edited question as a new one", async () => {
        const { history } = await setup({
          card: TEST_NATIVE_CARD,
          initialRoute: "/home",
        });

        history.push(`/question/${TEST_NATIVE_CARD.id}`);

        await waitFor(() => {
          expect(
            screen.getByTestId("mock-native-query-editor"),
          ).toBeInTheDocument();
        });

        const inputArea = within(
          screen.getByTestId("mock-native-query-editor"),
        ).getByRole("textbox");

        userEvent.click(inputArea);
        userEvent.type(inputArea, "0");
        userEvent.tab();

        userEvent.click(screen.getByText("Save"));

        const saveQuestionModal = screen.getByTestId("save-question-modal");
        userEvent.click(
          within(saveQuestionModal).getByText("Save as new question"),
        );
        userEvent.type(
          within(saveQuestionModal).getByPlaceholderText(
            "What is the name of your question?",
          ),
          "New question",
        );
        expect(screen.getByTestId("save-question-modal")).toBeInTheDocument();
        userEvent.click(
          within(saveQuestionModal).getByRole("button", { name: "Save" }),
        );

        await waitFor(() => {
          expect(
            screen.queryByTestId("save-question-modal"),
          ).not.toBeInTheDocument();
        });

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
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
        `path:/api/card/${TEST_NATIVE_CARD.id}/query/csv`,
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
      const mockDownloadEndpoint = fetchMock.post("path:/api/dataset/csv", {});
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
            url.includes("/api/dataset/csv") &&
            query?.native.query === "SELECT 1"
          );
        }),
      ).toBe(true);
    });
  });
});
