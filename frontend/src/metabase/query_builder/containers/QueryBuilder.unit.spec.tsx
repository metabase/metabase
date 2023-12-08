import userEvent from "@testing-library/user-event";
import type { ComponentPropsWithoutRef } from "react";
import { IndexRoute, Route } from "react-router";
import fetchMock from "fetch-mock";
import type { Card, Dataset, UnsavedCard } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockColumn,
  createMockDataset,
  createMockFieldValues,
  createMockModelIndex,
  createMockNativeDatasetQuery,
  createMockNativeQuery,
  createMockResultsMetadata,
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
import { checkNotNull } from "metabase/lib/types";
import {
  setupAlertsEndpoints,
  setupBookmarksEndpoints,
  setupCardDataset,
  setupCardsEndpoints,
  setupCardQueryEndpoints,
  setupDatabasesEndpoints,
  setupCollectionsEndpoints,
  setupSearchEndpoints,
  setupTimelinesEndpoints,
  setupModelIndexEndpoints,
  setupCardCreateEndpoint,
  setupCardQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupFieldValuesEndpoints,
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
import NewModelOptions from "metabase/models/containers/NewModelOptions";
import NewItemMenu from "metabase/containers/NewItemMenu";
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
      limit: 1,
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

const TEST_COLLECTION = createMockCollection();

const TEST_METADATA = createMockResultsMetadata();

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

const TestHome = () => <NewItemMenu trigger={<button>New</button>} />;

const TestRedirect = () => <div />;

function isSavedCard(card: Card | UnsavedCard | null): card is Card {
  return card !== null && "id" in card;
}

interface SetupOpts {
  card: Card | UnsavedCard | null;
  dataset?: Dataset;
  initialRoute?: string;
}

const setup = async ({
  card,
  dataset = createMockDataset(),
  initialRoute = `/question${
    isSavedCard(card) ? `/${card.id}` : `#${serializeCardForUrl(card)}`
  }`,
}: SetupOpts) => {
  setupDatabasesEndpoints([TEST_DB]);
  setupCardDataset(dataset);
  setupSearchEndpoints([]);
  setupCollectionsEndpoints({ collections: [] });
  setupBookmarksEndpoints([]);
  setupTimelinesEndpoints([]);
  setupCollectionByIdEndpoint({ collections: [TEST_COLLECTION] });
  setupFieldValuesEndpoints(
    createMockFieldValues({ field_id: Number(ORDERS.QUANTITY) }),
  );

  if (isSavedCard(card)) {
    setupCardsEndpoints([card]);
    setupCardQueryEndpoints(card, dataset);
    setupAlertsEndpoints(card, []);
    setupModelIndexEndpoints(card.id, []);
  }

  // this workaround can be removed when metabase#34523 is fixed
  if (card === null) {
    fetchMock.get("path:/api/model-index", [createMockModelIndex()]);
  }

  const mockEventListener = jest.spyOn(window, "addEventListener");

  const { history } = renderWithProviders(
    <Route>
      <Route path="/" component={TestHome} />
      <Route path="/model">
        <Route path="new" component={NewModelOptions} />
        <Route path="query" component={TestQueryBuilder} />
        <Route path="metadata" component={TestQueryBuilder} />
        <Route path="notebook" component={TestQueryBuilder} />
        <Route path=":slug/query" component={TestQueryBuilder} />
        <Route path=":slug/metadata" component={TestQueryBuilder} />
        <Route path=":slug/notebook" component={TestQueryBuilder} />
      </Route>
      <Route path="/question">
        <IndexRoute component={TestQueryBuilder} />
        <Route path="notebook" component={TestQueryBuilder} />
        <Route path=":slug" component={TestQueryBuilder} />
        <Route path=":slug/notebook" component={TestQueryBuilder} />
      </Route>
      <Route path="/redirect" component={TestRedirect} />
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
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("rendering", () => {
    describe("renders structured queries", () => {
      it("renders a structured question in the simple mode", async () => {
        await setup({ card: TEST_CARD });

        expect(screen.getByDisplayValue(TEST_CARD.name)).toBeInTheDocument();
      });

      it("renders a structured question in the notebook mode", async () => {
        await setup({
          card: TEST_CARD,
          initialRoute: `/question/${TEST_CARD.id}/notebook`,
        });

        expect(screen.getByDisplayValue(TEST_CARD.name)).toBeInTheDocument();
      });

      it("renders time series grouping widget for date field breakout", async () => {
        await setup({
          card: TEST_TIME_SERIES_WITH_DATE_BREAKOUT_CARD,
        });
        const timeSeriesModeFooter = await screen.findByTestId(
          "timeseries-chrome",
        );
        expect(timeSeriesModeFooter).toBeInTheDocument();
        expect(
          within(timeSeriesModeFooter).getByText("by"),
        ).toBeInTheDocument();
        expect(
          within(timeSeriesModeFooter).getByTestId("timeseries-bucket-button"),
        ).toBeInTheDocument();
      });

      it("doesn't render time series grouping widget for custom date field breakout (metabase#33504)", async () => {
        await setup({
          card: TEST_TIME_SERIES_WITH_CUSTOM_DATE_BREAKOUT_CARD,
        });

        const timeSeriesModeFooter = await screen.findByTestId(
          "timeseries-chrome",
        );
        expect(timeSeriesModeFooter).toBeInTheDocument();
        expect(
          within(timeSeriesModeFooter).queryByText("by"),
        ).not.toBeInTheDocument();
        expect(
          within(timeSeriesModeFooter).queryByTestId(
            "timeseries-bucket-button",
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
    describe("creating models", () => {
      it("shows custom warning modal when leaving via SPA navigation", async () => {
        const { mockEventListener } = await setup({
          card: null,
          initialRoute: "/model/new",
        });

        await startNewNotebookModel();

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.preventDefault).toHaveBeenCalled();
        expect(mockEvent.returnValue).toBe(BEFORE_UNLOAD_UNSAVED_MESSAGE);
      });
    });

    describe("editing models", () => {
      describe("editing queries", () => {
        it("should trigger beforeunload event when leaving edited query", async () => {
          const { mockEventListener } = await setup({
            card: TEST_MODEL_CARD,
            initialRoute: `/model/${TEST_MODEL_CARD.id}/query`,
          });

          await triggerNotebookQueryChange();
          await waitForSaveChangesToBeEnabled();

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
        it("should trigger beforeunload event when leaving edited metadata", async () => {
          const { mockEventListener } = await setup({
            card: TEST_MODEL_CARD,
            dataset: TEST_MODEL_DATASET,
            initialRoute: `/model/${TEST_MODEL_CARD.id}/metadata`,
          });

          await triggerMetadataChange();
          await waitForSaveChangesToBeEnabled();

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

    describe("creating native questions", () => {
      it("should trigger beforeunload event when leaving new non-empty native question", async () => {
        const { mockEventListener } = await setup({
          card: null,
          initialRoute: "/",
        });

        userEvent.click(screen.getByText("New"));
        userEvent.click(
          within(screen.getByTestId("popover")).getByText("SQL query"),
        );
        await waitForLoaderToBeRemoved();

        await triggerNativeQueryChange();
        await waitForSaveToBeEnabled();

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.preventDefault).toHaveBeenCalled();
        expect(mockEvent.returnValue).toBe(BEFORE_UNLOAD_UNSAVED_MESSAGE);
      });

      it("should not trigger beforeunload event when leaving new empty native question", async () => {
        const { mockEventListener } = await setup({
          card: null,
          initialRoute: "/",
        });

        userEvent.click(screen.getByText("New"));
        userEvent.click(
          within(screen.getByTestId("popover")).getByText("SQL query"),
        );

        await waitForLoaderToBeRemoved();

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockEvent.returnValue).toBe(undefined);
      });
    });

    describe("editing native questions", () => {
      it("should trigger beforeunload event when leaving edited question", async () => {
        const { mockEventListener } = await setup({
          card: TEST_NATIVE_CARD,
        });

        await triggerNativeQueryChange();

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.preventDefault).toHaveBeenCalled();
        expect(mockEvent.returnValue).toEqual(BEFORE_UNLOAD_UNSAVED_MESSAGE);
      });

      it("should trigger beforeunload event when user tries to leave an ad-hoc native query", async () => {
        const { mockEventListener } = await setup({
          card: TEST_UNSAVED_NATIVE_CARD,
        });

        await triggerNativeQueryChange();

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.preventDefault).toHaveBeenCalled();
        expect(mockEvent.returnValue).toEqual(BEFORE_UNLOAD_UNSAVED_MESSAGE);
      });

      it("should not trigger beforeunload event when query is unedited", async () => {
        const { mockEventListener } = await setup({
          card: TEST_NATIVE_CARD,
        });

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockEvent.returnValue).toEqual(undefined);
      });
    });

    describe("editing notebook questions", () => {
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
        expect(mockEvent.returnValue).toEqual(undefined);
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
        expect(mockEvent.returnValue).toEqual(undefined);
      });

      it("should not trigger beforeunload event when query is unedited", async () => {
        const { mockEventListener } = await setup({
          card: TEST_STRUCTURED_CARD,
        });

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockEvent.returnValue).toEqual(undefined);
      });
    });
  });

  describe("unsaved changes warning", () => {
    describe("creating models", () => {
      it("shows custom warning modal when leaving via SPA navigation", async () => {
        const { history } = await setup({
          card: null,
          initialRoute: "/model/new",
        });

        await startNewNotebookModel();

        history.push("/redirect");

        expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
      });

      it("shows custom warning modal when leaving via Cancel button", async () => {
        await setup({
          card: null,
          initialRoute: "/model/new",
        });

        await startNewNotebookModel();

        userEvent.click(screen.getByRole("button", { name: "Cancel" }));

        expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
      });

      it("does not show custom warning modal when saving new model", async () => {
        await setup({
          card: null,
          initialRoute: "/model/new",
        });
        setupCardCreateEndpoint();
        setupCardQueryMetadataEndpoint(TEST_NATIVE_CARD);

        await startNewNotebookModel();
        await waitForSaveToBeEnabled();

        userEvent.click(screen.getByRole("button", { name: "Save" }));
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

      it("shows custom warning modal when user tries to leave an ad-hoc native query", async () => {
        const { history } = await setup({
          card: TEST_UNSAVED_NATIVE_CARD,
          initialRoute: `/question#${serializeCardForUrl(
            TEST_UNSAVED_NATIVE_CARD,
          )}`,
        });

        await triggerNativeQueryChange();

        history.push("/redirect");

        expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
      });
    });

    describe("editing models", () => {
      describe("editing as notebook question", () => {
        it("does not show custom warning modal after editing model-based question via notebook editor and saving it", async () => {
          const { history } = await setup({
            card: TEST_MODEL_CARD,
            initialRoute: `/model/${TEST_MODEL_CARD.id}/notebook`,
          });

          await triggerNotebookQueryChange();
          await waitForSaveToBeEnabled();

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

          history.push("/redirect");

          expect(
            screen.queryByTestId("leave-confirmation"),
          ).not.toBeInTheDocument();
        });
      });

      describe("editing queries", () => {
        it("shows custom warning modal when leaving edited query via SPA navigation", async () => {
          const { history } = await setup({
            card: TEST_MODEL_CARD,
            initialRoute: `/model/${TEST_MODEL_CARD.id}/query`,
          });

          await triggerNotebookQueryChange();
          await waitForSaveChangesToBeEnabled();

          history.push("/redirect");

          expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
        });

        it("does not show custom warning modal when leaving unedited query via SPA navigation", async () => {
          const { history } = await setup({
            card: TEST_MODEL_CARD,
            initialRoute: `/model/${TEST_MODEL_CARD.id}/query`,
          });

          await triggerNotebookQueryChange();
          await waitForSaveChangesToBeEnabled();

          await revertNotebookQueryChange();
          await waitForSaveChangesToBeDisabled();

          history.push("/redirect");

          expect(
            screen.queryByTestId("leave-confirmation"),
          ).not.toBeInTheDocument();
        });

        it("shows custom warning modal when leaving edited query via Cancel button", async () => {
          await setup({
            card: TEST_MODEL_CARD,
            initialRoute: `/model/${TEST_MODEL_CARD.id}/query`,
          });

          await triggerNotebookQueryChange();
          await waitForSaveChangesToBeEnabled();

          userEvent.click(screen.getByRole("button", { name: "Cancel" }));

          expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
        });

        it("does not show custom warning modal when leaving unedited query via Cancel button", async () => {
          await setup({
            card: TEST_MODEL_CARD,
            initialRoute: `/model/${TEST_MODEL_CARD.id}/query`,
          });

          await triggerNotebookQueryChange();
          await waitForSaveChangesToBeEnabled();

          await revertNotebookQueryChange();
          await waitForSaveChangesToBeDisabled();

          userEvent.click(screen.getByRole("button", { name: "Cancel" }));

          expect(
            screen.queryByTestId("leave-confirmation"),
          ).not.toBeInTheDocument();
        });

        it("does not show custom warning modal when saving edited query", async () => {
          const { history } = await setup({
            card: TEST_MODEL_CARD,
            initialRoute: `/model/${TEST_MODEL_CARD.id}/query`,
          });

          await triggerNotebookQueryChange();
          await waitForSaveChangesToBeEnabled();

          userEvent.click(screen.getByRole("button", { name: "Save changes" }));

          await waitFor(() => {
            expect(history.getCurrentLocation().pathname).toEqual(
              `/model/${TEST_MODEL_CARD_SLUG}`,
            );
          });

          expect(
            screen.queryByTestId("leave-confirmation"),
          ).not.toBeInTheDocument();

          history.push("/redirect");

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
            initialRoute: `/model/${TEST_MODEL_CARD.id}/metadata`,
          });

          await triggerMetadataChange();
          await waitForSaveChangesToBeEnabled();

          history.push("/redirect");

          expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
        });

        it("does not show custom warning modal when leaving unedited metadata via SPA navigation", async () => {
          const { history } = await setup({
            card: TEST_MODEL_CARD,
            dataset: TEST_MODEL_DATASET,
            initialRoute: `/model/${TEST_MODEL_CARD.id}/metadata`,
          });

          history.push("/redirect");

          expect(
            screen.queryByTestId("leave-confirmation"),
          ).not.toBeInTheDocument();
        });

        it("does not show custom warning modal when leaving with no changes via Cancel button", async () => {
          await setup({
            card: TEST_MODEL_CARD,
            dataset: TEST_MODEL_DATASET,
            initialRoute: `/model/${TEST_MODEL_CARD.id}/metadata`,
          });

          await waitForLoaderToBeRemoved();

          userEvent.click(screen.getByRole("button", { name: "Cancel" }));

          expect(
            screen.queryByTestId("leave-confirmation"),
          ).not.toBeInTheDocument();
        });

        it("shows custom warning modal when leaving with unsaved changes via Cancel button", async () => {
          await setup({
            card: TEST_MODEL_CARD,
            dataset: TEST_MODEL_DATASET,
            initialRoute: `/model/${TEST_MODEL_CARD.id}/metadata`,
          });

          await triggerMetadataChange();
          await waitForSaveChangesToBeEnabled();

          userEvent.click(screen.getByRole("button", { name: "Cancel" }));

          expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
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

          await triggerMetadataChange();
          await waitForSaveChangesToBeEnabled();

          userEvent.click(screen.getByRole("button", { name: "Save changes" }));

          await waitFor(() => {
            expect(history.getCurrentLocation().pathname).toEqual(
              `/model/${TEST_MODEL_CARD_SLUG}`,
            );
          });

          expect(
            screen.queryByTestId("leave-confirmation"),
          ).not.toBeInTheDocument();

          history.push("/redirect");

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

        await triggerNotebookQueryChange();
        await waitForSaveChangesToBeEnabled();

        userEvent.click(screen.getByTestId("editor-tabs-metadata-name"));

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();

        await triggerMetadataChange();
        await waitForSaveChangesToBeEnabled();

        userEvent.click(screen.getByTestId("editor-tabs-query-name"));

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });

      it("does not show custom warning modal when editing & visualizing the model back and forth (metabase#35000)", async () => {
        await setup({
          card: TEST_MODEL_CARD,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/notebook`,
        });

        await triggerNotebookQueryChange();
        await waitForSaveToBeEnabled();

        userEvent.click(screen.getByText("Visualize"));
        await waitForLoaderToBeRemoved();

        userEvent.click(screen.getByLabelText("notebook icon"));

        await waitFor(() => {
          expect(screen.getByText("Visualize")).toBeInTheDocument();
        });

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });
    });

    describe("creating native questions", () => {
      it("shows custom warning modal when leaving creating non-empty question via SPA navigation", async () => {
        const { history } = await setup({
          card: null,
          initialRoute: "/",
        });

        userEvent.click(screen.getByText("New"));
        userEvent.click(
          within(screen.getByTestId("popover")).getByText("SQL query"),
        );
        await waitForLoaderToBeRemoved();

        await triggerNativeQueryChange();
        await waitForSaveToBeEnabled();

        history.push("/redirect");

        expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
      });

      it("does not show custom warning modal when leaving creating empty question via SPA navigation", async () => {
        const { history } = await setup({
          card: null,
          initialRoute: "/",
        });

        userEvent.click(screen.getByText("New"));
        userEvent.click(
          within(screen.getByTestId("popover")).getByText("SQL query"),
        );
        await waitForLoaderToBeRemoved();

        history.push("/redirect");

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });

      it("does not show custom warning modal when running new question", async () => {
        await setup({
          card: null,
          initialRoute: "/",
        });

        userEvent.click(screen.getByText("New"));
        userEvent.click(
          within(screen.getByTestId("popover")).getByText("SQL query"),
        );
        await waitForLoaderToBeRemoved();

        userEvent.click(
          within(screen.getByTestId("query-builder-main")).getByRole("button", {
            name: "Get Answer",
          }),
        );

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });

      it("does not show custom warning modal when saving new question", async () => {
        const { history } = await setup({
          card: null,
          initialRoute: "/",
        });
        fetchMock.post("path:/api/card", TEST_NATIVE_CARD);
        fetchMock.get("path:/api/table/card__1/query_metadata", TEST_METADATA);

        userEvent.click(screen.getByText("New"));
        userEvent.click(
          within(screen.getByTestId("popover")).getByText("SQL query"),
        );
        await waitForLoaderToBeRemoved();

        await triggerNativeQueryChange();
        await waitForSaveToBeEnabled();

        userEvent.click(screen.getByText("Save"));

        const saveQuestionModal = screen.getByTestId("save-question-modal");
        userEvent.type(
          within(saveQuestionModal).getByLabelText("Name"),
          TEST_NATIVE_CARD.name,
        );
        await waitFor(() => {
          expect(
            within(saveQuestionModal).getByTestId("select-button"),
          ).toHaveTextContent(TEST_COLLECTION.name);
        });
        userEvent.click(
          within(saveQuestionModal).getByRole("button", { name: "Save" }),
        );

        await waitFor(() => {
          expect(saveQuestionModal).not.toBeInTheDocument();
        });

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();

        history.push("/redirect");

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });
    });

    describe("editing native questions", () => {
      it("shows custom warning modal when leaving edited question via SPA navigation", async () => {
        const { history } = await setup({
          card: TEST_NATIVE_CARD,
          initialRoute: `/question/${TEST_NATIVE_CARD.id}`,
        });

        await triggerNativeQueryChange();
        await waitForSaveToBeEnabled();

        history.push("/redirect");

        expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
      });

      it("does not show custom warning modal leaving with no changes via SPA navigation", async () => {
        const { history } = await setup({
          card: TEST_NATIVE_CARD,
          initialRoute: `/question/${TEST_NATIVE_CARD.id}`,
        });

        await waitForNativeQueryEditoReady();

        history.push("/redirect");

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });

      it("does not show custom warning modal when running edited question", async () => {
        await setup({
          card: TEST_NATIVE_CARD,
          initialRoute: `/question/${TEST_NATIVE_CARD.id}`,
        });

        await triggerNativeQueryChange();
        await waitForSaveToBeEnabled();

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
          initialRoute: `/question/${TEST_NATIVE_CARD.id}`,
        });

        await triggerNativeQueryChange();
        await waitForSaveToBeEnabled();

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

        history.push("/redirect");

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });

      it("does not show custom warning modal when saving edited question as a new one", async () => {
        const { history } = await setup({
          card: TEST_NATIVE_CARD,
          initialRoute: `/question/${TEST_NATIVE_CARD.id}`,
        });

        await triggerNativeQueryChange();
        await waitForSaveToBeEnabled();

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

        history.push("/redirect");

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });
    });

    describe("editing notebook questions", () => {
      it("shows custom warning modal when leaving notebook-edited question via SPA navigation", async () => {
        const { history } = await setup({
          card: TEST_STRUCTURED_CARD,
          initialRoute: `/question/${TEST_STRUCTURED_CARD.id}/notebook`,
        });

        await triggerNotebookQueryChange();
        await waitForSaveToBeEnabled();

        history.push("/redirect");

        expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
      });

      it("does not show custom warning modal when leaving visualization-edited question via SPA navigation", async () => {
        const { history } = await setup({
          card: TEST_STRUCTURED_CARD,
          initialRoute: `/question/${TEST_STRUCTURED_CARD.id}`,
        });

        await triggerVisualizationQueryChange();
        await waitForSaveToBeEnabled();

        history.push("/redirect");

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });

      it("does not show custom warning modal leaving with no changes via SPA navigation", async () => {
        const { history } = await setup({
          card: TEST_STRUCTURED_CARD,
          initialRoute: `/question/${TEST_STRUCTURED_CARD.id}/notebook`,
        });

        history.push("/redirect");

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });

      it("does not show custom warning modal when editing & visualizing the question back and forth (metabase#35000)", async () => {
        await setup({
          card: TEST_STRUCTURED_CARD,
          initialRoute: `/question/${TEST_STRUCTURED_CARD.id}/notebook`,
        });

        await triggerNotebookQueryChange();
        await waitForSaveToBeEnabled();

        userEvent.click(screen.getByText("Visualize"));
        await waitForLoaderToBeRemoved();

        userEvent.click(screen.getByLabelText("notebook icon"));

        await waitFor(() => {
          expect(screen.getByText("Visualize")).toBeInTheDocument();
        });

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });

      it("does not show custom warning modal when saving edited question", async () => {
        const { history } = await setup({
          card: TEST_STRUCTURED_CARD,
          initialRoute: `/question/${TEST_STRUCTURED_CARD.id}/notebook`,
        });

        await triggerNotebookQueryChange();
        await waitForSaveToBeEnabled();

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

        history.push("/redirect");

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });

      it("does not show custom warning modal when saving edited question as a new one", async () => {
        const { history } = await setup({
          card: TEST_STRUCTURED_CARD,
          initialRoute: `/question/${TEST_STRUCTURED_CARD.id}/notebook`,
        });

        await triggerNotebookQueryChange();
        await waitForSaveToBeEnabled();

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

        history.push("/redirect");

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

const startNewNotebookModel = async () => {
  userEvent.click(screen.getByText("Use the notebook editor"));
  await waitForLoaderToBeRemoved();

  userEvent.click(screen.getByText("Pick your starting data"));
  const popover = screen.getByTestId("popover");
  userEvent.click(within(popover).getByText("Sample Database"));
  await waitForLoaderToBeRemoved();
  userEvent.click(within(popover).getByText("Orders"));
  userEvent.click(within(screen.getByTestId("popover")).getByText("Orders"));

  expect(screen.getByRole("button", { name: "Get Answer" })).toBeEnabled();
};

const triggerNativeQueryChange = async () => {
  await waitForNativeQueryEditoReady();

  const inputArea = within(
    screen.getByTestId("mock-native-query-editor"),
  ).getByRole("textbox");

  userEvent.click(inputArea);
  userEvent.type(inputArea, "0");
  userEvent.tab();
};

const triggerMetadataChange = async () => {
  await waitFor(() => {
    expect(screen.getByTitle("Display name")).toBeInTheDocument();
  });

  const columnDisplayName = screen.getByTitle("Display name");

  userEvent.click(columnDisplayName);
  userEvent.type(columnDisplayName, "X");
  userEvent.tab();
};

const triggerVisualizationQueryChange = async () => {
  userEvent.click(screen.getByText("Filter"));

  const modal = screen.getByRole("dialog");
  const total = within(modal).getByTestId("filter-field-Total");
  const maxInput = within(total).getByPlaceholderText("Max");
  userEvent.type(maxInput, "1000");
  userEvent.tab();

  userEvent.click(screen.getByTestId("apply-filters"));
};

const triggerNotebookQueryChange = async () => {
  userEvent.click(screen.getByText("Row limit"));

  const rowLimitInput = await within(
    screen.getByTestId("step-limit-0-0"),
  ).findByPlaceholderText("Enter a limit");

  userEvent.click(rowLimitInput);
  userEvent.type(rowLimitInput, "1");
  userEvent.tab();
};

/**
 * Reverts triggerNotebookQueryChange call
 */
const revertNotebookQueryChange = async () => {
  const limitStep = screen.getByTestId("step-limit-0-0");
  const limitInput = await within(limitStep).findByPlaceholderText(
    "Enter a limit",
  );

  userEvent.click(limitInput);
  userEvent.type(limitInput, "{backspace}");
  userEvent.tab();
};

const waitForSaveChangesToBeEnabled = async () => {
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });
};

const waitForSaveChangesToBeDisabled = async () => {
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });
};

const waitForSaveToBeEnabled = async () => {
  await waitFor(() => {
    expect(screen.getByText("Save")).toBeEnabled();
  });
};

const waitForNativeQueryEditoReady = async () => {
  await waitFor(() => {
    expect(screen.getByTestId("mock-native-query-editor")).toBeInTheDocument();
  });
};
