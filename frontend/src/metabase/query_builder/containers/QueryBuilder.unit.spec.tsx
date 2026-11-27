import userEvent from "@testing-library/user-event";
import { setPlatformAPI } from "echarts/core";
import fetchMock, { type CallLog } from "fetch-mock";
import { setupJestCanvasMock } from "jest-canvas-mock";
import _ from "underscore";

import {
  setupCardQueryMetadataEndpoint,
  setupCardsEndpoints,
  setupCollectionItemsEndpoint,
  setupFieldValuesEndpoint,
  setupLastDownloadFormatEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import {
  act,
  renderHook,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { mockGetBoundingClientRect } from "__support__/utils";
import { serializeCardForUrl } from "metabase/common/utils/card";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { defer } from "metabase/utils/promise";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  Dataset,
  DatasetQuery,
  TestStageWithSourceSpec,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockCollectionItemFromCollection,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE_ID,
  PRODUCTS,
  PRODUCTS_ID,
  PRODUCT_CATEGORY_VALUES,
  PRODUCT_VENDOR_VALUES,
  createOrdersCreatedAtDatasetColumn,
  createOrdersIdDatasetColumn,
  createPeopleStateDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { isObject } from "metabase-types/guards";

import { getQuestion } from "../store/selectors";

import {
  TEST_CARD,
  TEST_CARD_VISUALIZATION,
  TEST_COLLECTION,
  TEST_MODEL_DATASET,
  TEST_NATIVE_CARD,
  TEST_NATIVE_CARD_DATASET,
  TEST_STRUCTURED_CARD,
  TEST_TIME_SERIES_WITH_CUSTOM_DATE_BREAKOUT_CARD,
  TEST_TIME_SERIES_WITH_DATE_BREAKOUT_CARD,
  TEST_UNSAVED_STRUCTURED_CARD,
  setup,
  waitForFaviconReady,
  waitForSaveToBeEnabled,
} from "./test-utils";

registerVisualizations();

// A field id that is not in the sample database metadata
const MISSING_FIELD_ID = 9999;

function getSourceTableId(call: CallLog): unknown {
  const body: unknown = JSON.parse(String(call.options.body));
  const stages = isObject(body) ? body.stages : undefined;
  const firstStage = Array.isArray(stages) ? stages[0] : undefined;
  return isObject(firstStage) ? firstStage["source-table"] : undefined;
}

describe("QueryBuilder", () => {
  setupCanvasTextMeasurement();

  beforeEach(() => {
    setupLastDownloadFormatEndpoints();
  });

  afterEach(() => {
    jest.resetAllMocks();
    setupJestCanvasMock();
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

      it("renders the notebook of a question whose custom column references a missing field (metabase#28221)", async () => {
        const customColumnName = "Non-existing field";
        const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              joins: [
                {
                  source: { type: "table", id: PRODUCTS_ID },
                  strategy: "left-join",
                  conditions: [
                    {
                      operator: "=",
                      left: { type: "column", name: "PRODUCT_ID" },
                      right: { type: "column", name: "ID" },
                    },
                  ],
                },
              ],
              expressions: [
                {
                  name: customColumnName,
                  value: { type: "column", fieldId: ORDERS.TAX },
                },
              ],
            },
          ],
        });
        // Point the custom column at a field that the metadata does not have
        const queryJson = JSON.stringify(Lib.toJsQuery(query));
        const taxReference = `},${ORDERS.TAX}]`;
        expect(queryJson.split(taxReference)).toHaveLength(2);
        const datasetQuery: DatasetQuery = JSON.parse(
          queryJson.replace(taxReference, `},${MISSING_FIELD_ID}]`),
        );
        const card = createMockCard({
          id: 2,
          name: "Reproduce 28221",
          dataset_query: datasetQuery,
        });

        await setup({
          card,
          initialRoute: `/question/${card.id}/notebook`,
        });

        expect(
          await screen.findByDisplayValue("Reproduce 28221"),
        ).toBeVisible();
        expect(
          await within(screen.getByTestId("step-expression-0-0")).findByText(
            customColumnName,
          ),
        ).toBeVisible();
      });

      it("removes a breakout of a pivot question in the notebook (metabase#28874)", async () => {
        const card = createMockUnsavedCard({
          display: "pivot",
          dataset_query: Lib.toJsQuery(
            Lib.createTestQuery(SAMPLE_PROVIDER, {
              stages: [
                {
                  source: { type: "table", id: ORDERS_ID },
                  aggregations: [
                    { type: "operator", operator: "count", args: [] },
                  ],
                  breakouts: [
                    { type: "column", name: "CREATED_AT", unit: "year" },
                    { type: "column", name: "PRODUCT_ID" },
                  ],
                },
              ],
            }),
          ),
        });

        await setup({
          card,
          initialRoute: `/question/notebook#${serializeCardForUrl(card)}`,
        });

        const summarizeStep = await screen.findByTestId("step-summarize-0-0");
        const productId = await within(summarizeStep).findByText("Product ID");
        await userEvent.click(within(productId).getByLabelText("close icon"));

        await waitFor(() =>
          expect(
            within(summarizeStep).queryByText("Product ID"),
          ).not.toBeInTheDocument(),
        );
        expect(
          within(summarizeStep).getByText("Created At: Year"),
        ).toBeInTheDocument();
        expect(within(summarizeStep).getByText("Count")).toBeInTheDocument();
      });

      it("renders time series grouping widget for date field breakout", async () => {
        await setup({
          card: TEST_TIME_SERIES_WITH_DATE_BREAKOUT_CARD,
        });
        const timeSeriesModeFooter =
          await screen.findByTestId("timeseries-chrome");
        expect(timeSeriesModeFooter).toBeInTheDocument();
        expect(
          within(timeSeriesModeFooter).getByText("by"),
        ).toBeInTheDocument();
        expect(
          within(timeSeriesModeFooter).getByTestId("timeseries-bucket-button"),
        ).toBeInTheDocument();
      });

      it("renders time series grouping widget for custom date field breakout", async () => {
        await setup({
          card: TEST_TIME_SERIES_WITH_CUSTOM_DATE_BREAKOUT_CARD,
        });

        const timeSeriesModeFooter =
          await screen.findByTestId("timeseries-chrome");
        expect(timeSeriesModeFooter).toBeInTheDocument();
        expect(
          within(timeSeriesModeFooter).getByText("by"),
        ).toBeInTheDocument();
        expect(
          within(timeSeriesModeFooter).getByTestId("timeseries-bucket-button"),
        ).toBeInTheDocument();
      });
    });

    describe("renders the row count regardless of visualization type", () => {
      const dataset = TEST_MODEL_DATASET;
      const cards = [
        createMockCard({ ...TEST_CARD_VISUALIZATION, display: "table" }),
        createMockCard({ ...TEST_CARD_VISUALIZATION, display: "line" }),
      ];

      beforeEach(() => {
        fetchMock.put("path:/api/setting/non-table-chart-generated", 200);
        setupSettingsEndpoints([]);
      });

      it.each(cards)(
        `renders the row count in "$display" visualization`,
        async (card) => {
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

    it("uses the question name as the document title (metabase#42165)", async () => {
      // AppComponent sets the application name as the base of the title stack
      renderHook(() => usePageTitle("Metabase", { titleIndex: 0 }));
      await setup({ card: TEST_STRUCTURED_CARD });

      await waitFor(() =>
        expect(document.title).toBe(`${TEST_STRUCTURED_CARD.name} · Metabase`),
      );
    });

    it("stops showing the loading document title when the query fails (metabase#49270)", async () => {
      renderHook(() => usePageTitle("Metabase", { titleIndex: 0 }));
      await setup({ card: TEST_UNSAVED_STRUCTURED_CARD });
      await waitFor(() => expect(document.title).toBe("Question · Metabase"));

      const response = defer<Response>();
      fetchMock.removeRoute("dataset-post");
      fetchMock.post("path:/api/dataset", () => response.promise, {
        name: "dataset-post",
      });

      const [runButton] = screen.getAllByTestId("run-button");
      await userEvent.click(runButton);
      await waitFor(() =>
        expect(document.title).toBe("Doing science... · Metabase"),
      );

      response.resolve(new Response(JSON.stringify({}), { status: 500 }));
      await waitFor(() => expect(document.title).toBe("Question · Metabase"));
    });

    describe("query execution time", () => {
      it("renders query execution time for mbql questions", async () => {
        await setup({
          card: TEST_CARD,
          dataset: createMockDataset({
            running_time: 123,
          }),
        });

        const [runButton] = screen.getAllByTestId("run-button");
        await userEvent.click(runButton);
        await waitForLoaderToBeRemoved();

        const executionTime = await screen.findByTestId("execution-time");
        expect(executionTime).toBeInTheDocument();
        expect(executionTime).toHaveTextContent("123ms");
      });

      it("renders query execution time for native questions", async () => {
        await setup({
          card: TEST_NATIVE_CARD,
          dataset: createMockDataset({
            running_time: 123,
          }),
        });

        const executionTime = await screen.findByTestId("execution-time");
        expect(executionTime).toBeInTheDocument();
        expect(executionTime).toHaveTextContent("123ms");
      });
    });

    it("renders the database error of a failed native query", async () => {
      const message = 'Table "NOT_A_TABLE" not found';
      await setup({
        card: TEST_NATIVE_CARD,
        dataset: createMockDataset({ status: "failed", error: message }),
      });

      const visualization = await screen.findByTestId(
        "query-visualization-root",
      );
      expect(
        await within(visualization).findByText(
          "An error occurred in your query",
        ),
      ).toBeInTheDocument();
      expect(within(visualization).getByText(message)).toBeInTheDocument();
    });

    it("renders the permission error when the backend refuses an ad-hoc question with a 403", async () => {
      // Registered before `setup`, so it matches before the default dataset route.
      fetchMock.post("path:/api/dataset", (call: CallLog) =>
        getSourceTableId(call) === ORDERS_ID
          ? {
              status: 403,
              body: {
                data: { rows: [], cols: [] },
                row_count: 0,
                status: "failed",
                error: "You do not have permissions to run this query.",
                error_type: "missing-required-permissions",
              },
            }
          : createMockDataset(),
      );
      await setup({ card: TEST_UNSAVED_STRUCTURED_CARD });

      const visualization = await screen.findByTestId(
        "query-visualization-root",
      );
      expect(
        await within(visualization).findByText(
          "Sorry, you don't have permission to run this query.",
        ),
      ).toBeVisible();
      const runCall = checkNotNull(
        fetchMock.callHistory.lastCall("path:/api/dataset", { method: "POST" }),
      );
      expect(getSourceTableId(runCall)).toBe(ORDERS_ID);
    });
  });

  describe("development watermark", () => {
    // the table only draws the rows that fit in its measured size
    mockGetBoundingClientRect({ width: 1000, height: 800 });

    const DATASET = createMockDataset({
      data: createMockDatasetData({
        cols: [createMockColumn({ name: "TOTAL", display_name: "Total" })],
        rows: [[39.72], [117.03]],
      }),
    });

    it.each([true, false])(
      "shows the watermark on a saved question only in development mode (development mode: %s)",
      async (isDevelopmentMode) => {
        await setup({
          card: TEST_STRUCTURED_CARD,
          dataset: DATASET,
          tokenFeatures: { development_mode: isDevelopmentMode },
        });

        expect(await screen.findByText("117.03")).toBeInTheDocument();
        expect(screen.queryAllByTestId("development-watermark")).toHaveLength(
          isDevelopmentMode ? 1 : 0,
        );
      },
    );
  });

  describe("saving a new question", () => {
    mockGetBoundingClientRect();

    it("saves a new question under the name and collection picked in the modal (metabase#55631)", async () => {
      const firstCollection = createMockCollection({
        id: 2,
        name: "First collection",
      });
      await setup({
        card: TEST_UNSAVED_STRUCTURED_CARD,
        collections: [
          createMockCollection({
            id: "root",
            name: "Our analytics",
            can_write: true,
          }),
          TEST_COLLECTION,
          firstCollection,
        ],
      });
      setupCollectionItemsEndpoint({
        collection: { id: "root" },
        collectionItems: [TEST_COLLECTION, firstCollection].map((collection) =>
          createMockCollectionItemFromCollection({
            ...collection,
            can_write: true,
            here: ["collection"],
          }),
        ),
      });
      setupCollectionItemsEndpoint({
        collection: TEST_COLLECTION,
        collectionItems: [],
      });
      setupCollectionItemsEndpoint({
        collection: firstCollection,
        collectionItems: [],
      });
      const savedCard = createMockCard({
        id: 1,
        name: "Custom",
        collection_id: firstCollection.id,
        dataset_query: TEST_UNSAVED_STRUCTURED_CARD.dataset_query,
      });
      setupCardsEndpoints([savedCard]);
      setupCardQueryMetadataEndpoint(
        savedCard,
        createMockCardQueryMetadata({ databases: [createSampleDatabase()] }),
      );

      await waitForSaveToBeEnabled();
      await userEvent.click(screen.getByText("Save"));
      const modal = await screen.findByTestId("save-question-modal");
      const nameInput = within(modal).getByLabelText("Name");
      expect(nameInput).toHaveValue("Orders");
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, "Custom");
      await userEvent.click(
        within(modal).getByLabelText(/Where do you want to save this/),
      );
      const picker = await screen.findByTestId("entity-picker-modal");
      await userEvent.click(
        await within(picker).findByText("First collection"),
      );
      await userEvent.click(
        within(picker).getByRole("button", { name: "Select this collection" }),
      );
      await waitFor(() =>
        expect(
          within(modal).getByLabelText(/Where do you want to save this/),
        ).toHaveTextContent("First collection"),
      );

      await userEvent.click(
        within(modal).getByRole("button", { name: "Save" }),
      );
      await waitFor(() =>
        expect(
          screen.queryByTestId("save-question-modal"),
        ).not.toBeInTheDocument(),
      );

      const createCall = checkNotNull(
        fetchMock.callHistory.lastCall("card-create"),
      );
      const createBody: unknown = JSON.parse(String(createCall.options.body));
      expect(createBody).toMatchObject({
        name: "Custom",
        collection_id: firstCollection.id,
      });
      expect(await screen.findByDisplayValue("Custom")).toBeInTheDocument();
    });
  });

  describe("archived question", () => {
    const getHeaderActionPanel = () =>
      screen.getByTestId("qb-header-action-panel");

    it("shows the editing actions of a question that is not archived", async () => {
      await setup({ card: { ...TEST_STRUCTURED_CARD, archived: false } });

      expect(screen.queryByTestId("archive-banner")).not.toBeInTheDocument();
      const actionPanel = getHeaderActionPanel();
      expect(within(actionPanel).getByText("Filter")).toBeInTheDocument();
      expect(within(actionPanel).getByText("Summarize")).toBeInTheDocument();
      expect(
        within(actionPanel).getByTestId("notebook-button"),
      ).toBeInTheDocument();
      expect(
        within(actionPanel).getByLabelText("bookmark icon"),
      ).toBeInTheDocument();
      expect(
        within(actionPanel).getByLabelText("ellipsis icon"),
      ).toBeInTheDocument();
      expect(
        within(actionPanel).getByTestId("sharing-menu-button"),
      ).toBeInTheDocument();
      expect(
        within(screen.getByTestId("view-footer")).getByText("Visualization"),
      ).toBeInTheDocument();
    });

    it("shows the archive banner and hides the editing actions of an archived question", async () => {
      await setup({ card: { ...TEST_STRUCTURED_CARD, archived: true } });

      expect(screen.getByTestId("archive-banner")).toBeInTheDocument();
      expect(
        screen.getByText("This question is in the trash."),
      ).toBeInTheDocument();
      const actionPanel = getHeaderActionPanel();
      expect(within(actionPanel).queryByText("Filter")).not.toBeInTheDocument();
      expect(
        within(actionPanel).queryByText("Summarize"),
      ).not.toBeInTheDocument();
      expect(
        within(actionPanel).queryByTestId("notebook-button"),
      ).not.toBeInTheDocument();
      expect(
        within(actionPanel).queryByLabelText("bookmark icon"),
      ).not.toBeInTheDocument();
      expect(
        within(actionPanel).queryByLabelText("ellipsis icon"),
      ).not.toBeInTheDocument();
      expect(
        within(actionPanel).queryByTestId("sharing-menu-button"),
      ).not.toBeInTheDocument();
      expect(
        within(screen.getByTestId("view-footer")).queryByText("Visualization"),
      ).not.toBeInTheDocument();
    });
  });

  describe("downloading results", () => {
    // I initially planned to test unsaved native (ad-hoc) queries here as well.
    // But native queries won't run the query on first load, we need to manually
    // click the run button, but our mock `NativeQueryEditor` doesn't have a run
    // button wired up, and it's quite hard to do so (I've tried).
    // So I test that case in Cypress in `28834-modified-native-question.cy.spec.js` instead.

    it("should allow downloading results for a native query", async () => {
      fetchMock.post(`path:/api/card/${TEST_NATIVE_CARD.id}/query/csv`, {});
      await setup({
        card: TEST_NATIVE_CARD,
        dataset: TEST_NATIVE_CARD_DATASET,
      });
      const container = screen.getByTestId("test-container");

      await waitForFaviconReady(container);

      const inputArea = within(
        screen.getByTestId("mock-native-query-editor"),
      ).getByRole("textbox");

      expect(inputArea).toHaveValue("SELECT 1");

      await userEvent.click(
        screen.getByTestId("question-results-download-button"),
      );
      await userEvent.click(await screen.findByLabelText(".csv"));
      await userEvent.click(
        await screen.findByTestId("download-results-button"),
      );

      expect(
        fetchMock.callHistory.calls(
          `path:/api/card/${TEST_NATIVE_CARD.id}/query/csv`,
        ),
      ).toHaveLength(1);
    });

    it("should allow downloading results for a native query using the current result even the query has changed but not rerun (metabase#28834)", async () => {
      fetchMock.post("path:/api/dataset/csv", {});
      await setup({
        card: TEST_NATIVE_CARD,
        dataset: TEST_NATIVE_CARD_DATASET,
      });

      const container = screen.getByTestId("test-container");

      await waitForFaviconReady(container);

      const inputArea = within(
        screen.getByTestId("mock-native-query-editor"),
      ).getByRole("textbox");

      await userEvent.click(inputArea);
      await userEvent.type(inputArea, " union SELECT 2");

      await userEvent.tab();

      expect(inputArea).toHaveValue("SELECT 1 union SELECT 2");

      await userEvent.click(
        screen.getByTestId("question-results-download-button"),
      );
      await userEvent.click(await screen.findByLabelText(".csv"));
      await userEvent.click(
        await screen.findByTestId("download-results-button"),
      );

      const calls = fetchMock.callHistory.calls("path:/api/dataset/csv");
      const lastCall = calls[calls.length - 1];
      const body = await Promise.resolve(lastCall.options?.body);
      // Unjustified type cast. FIXME
      const urlSearchParams = new URLSearchParams(body as string);
      expect(lastCall.url).toEqual(expect.stringContaining("/api/dataset/csv"));
      const query =
        urlSearchParams instanceof URLSearchParams
          ? JSON.parse(urlSearchParams.get("query") ?? "{}")
          : {};
      expect(query).toMatchObject({ stages: [{ native: "SELECT 1" }] });
    });
  });

  describe("column header drills", () => {
    const CUSTOM_DATE_CARD = createMockUnsavedCard({
      display: "table",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              fields: [{ type: "column", name: "ID" }],
              expressions: [
                {
                  name: "CustomDate",
                  value: { type: "column", fieldId: ORDERS.CREATED_AT },
                },
              ],
            },
          ],
        }),
      ),
    });

    const CUSTOM_DATE_DATASET = createMockDataset({
      data: createMockDatasetData({
        rows: [[1, "2027-12-11T00:00:00Z"]],
        cols: [
          createOrdersIdDatasetColumn(),
          createMockColumn({
            id: undefined,
            table_id: undefined,
            name: "CustomDate",
            display_name: "CustomDate",
            source: "fields",
            field_ref: ["expression", "CustomDate"],
            base_type: "type/DateTime",
            effective_type: "type/DateTime",
          }),
        ],
      }),
    });

    const FILTERED_CUSTOM_DATE_DATASET = createMockDataset({
      data: createMockDatasetData({
        rows: [
          [2, "2027-12-10T00:00:00Z"],
          [3, "2027-12-24T00:00:00Z"],
          [4, "2028-01-05T00:00:00Z"],
        ],
        cols: CUSTOM_DATE_DATASET.data.cols,
      }),
      row_count: 3,
    });

    function isCustomDateRangeQuery(call: CallLog) {
      const body = String(call.options.body);
      return (
        body.includes('"between"') &&
        body.includes('"2027-12-10"') &&
        body.includes('"2028-01-05"')
      );
    }

    mockGetBoundingClientRect({ width: 1000, height: 800 });

    it("should add a date range filter to a custom column from its column header", async () => {
      const { store } = await setup({
        card: CUSTOM_DATE_CARD,
        dataset: CUSTOM_DATE_DATASET,
      });
      fetchMock.modifyRoute("dataset-post", {
        response: (call: CallLog) =>
          isCustomDateRangeQuery(call)
            ? FILTERED_CUSTOM_DATE_DATASET
            : CUSTOM_DATE_DATASET,
      });

      const headerCell = await screen.findByRole("columnheader", {
        name: "CustomDate",
      });
      await userEvent.click(within(headerCell).getByText("CustomDate"));
      expect(
        await screen.findByRole("button", { name: /Filter by this column/ }),
      ).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", { name: /Filter by this column/ }),
      );
      expect(
        await screen.findByTestId("date-filter-picker"),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByText("Fixed date range…"));
      const startDateInput = await screen.findByLabelText("Start date");
      await userEvent.clear(startDateInput);
      await userEvent.type(startDateInput, "12/10/2027");
      const endDateInput = screen.getByLabelText("End date");
      await userEvent.clear(endDateInput);
      await userEvent.type(endDateInput, "01/05/2028");
      await userEvent.click(screen.getByRole("button", { name: "Add filter" }));

      expect(
        await within(await screen.findByTestId("qb-filters-panel")).findByText(
          "CustomDate is Dec 10, 2027 – Jan 5, 2028",
        ),
      ).toBeInTheDocument();

      const query = checkNotNull(getQuestion(store.getState())).query();
      const filters = Lib.filters(query, -1);
      expect(filters).toHaveLength(1);
      const filterParts = checkNotNull(
        Lib.specificDateFilterParts(query, -1, filters[0]),
      );
      expect(filterParts).toMatchObject({
        operator: "between",
        values: [new Date(2027, 11, 10), new Date(2028, 0, 5)],
        hasTime: false,
      });
      expect(Lib.displayInfo(query, -1, filterParts.column).displayName).toBe(
        "CustomDate",
      );

      expect(await screen.findByText("Showing 3 rows")).toBeInTheDocument();
      const runCall = checkNotNull(
        fetchMock.callHistory.lastCall("path:/api/dataset", { method: "POST" }),
      );
      const runBody: unknown = JSON.parse(String(runCall.options.body));
      expect(runBody).toMatchObject({
        stages: [
          {
            filters: [
              [
                "between",
                expect.anything(),
                ["expression", expect.anything(), "CustomDate"],
                "2027-12-10",
                "2028-01-05",
              ],
            ],
          },
        ],
      });
    });
  });

  describe("filtering from the header and going back", () => {
    const PRODUCTS_CARD = createMockUnsavedCard({
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [{ source: { type: "table", id: PRODUCTS_ID } }],
        }),
      ),
    });

    afterEach(() => {
      window.history.replaceState(null, "", "/");
    });

    it("focuses the filter search and shows the running query after going back (metabase#54817, metabase#57398)", async () => {
      setupFieldValuesEndpoint(PRODUCT_CATEGORY_VALUES);
      setupFieldValuesEndpoint({
        ...PRODUCT_VENDOR_VALUES,
        has_more_values: false,
      });
      const { router } = await setup({
        card: PRODUCTS_CARD,
        syncWindowLocation: true,
      });

      await userEvent.click(
        await screen.findByTestId("question-filter-header"),
      );
      const popover = await screen.findByRole("dialog");
      expect(within(popover).getByPlaceholderText("Find...")).toHaveFocus();

      await userEvent.click(within(popover).getByText("Category"));
      await userEvent.click(await within(popover).findByText("Widget"));
      await userEvent.click(
        within(popover).getByLabelText("Add another filter"),
      );

      await userEvent.click(await within(popover).findByText("Vendor"));
      await userEvent.click(await within(popover).findByText("Vendor 3"));
      await userEvent.click(
        within(popover).getByLabelText("Add another filter"),
      );

      const filtersPanel = await screen.findByTestId("qb-filters-panel");
      expect(
        await within(filtersPanel).findByText("Vendor is Vendor 3"),
      ).toBeInTheDocument();

      const response = defer<Dataset>();
      fetchMock.modifyRoute("dataset-post", {
        response: () => response.promise,
      });
      const requestCountBeforeBack = fetchMock.callHistory.calls(
        "path:/api/dataset",
        { method: "POST" },
      ).length;

      act(() => router.back());

      expect(
        await within(
          await screen.findByTestId("query-builder-main"),
        ).findByTestId("loading-indicator"),
      ).toBeInTheDocument();
      const panelAfterBack = await screen.findByTestId("qb-filters-panel");
      expect(
        within(panelAfterBack).getByText("Category is Widget"),
      ).toBeInTheDocument();
      expect(
        within(panelAfterBack).queryByText("Vendor is Vendor 3"),
      ).not.toBeInTheDocument();

      const runCalls = fetchMock.callHistory.calls("path:/api/dataset", {
        method: "POST",
      });
      expect(runCalls.length).toBe(requestCountBeforeBack + 1);
      const runBody: unknown = JSON.parse(
        String(runCalls[runCalls.length - 1].options.body),
      );
      expect(runBody).toMatchObject({
        stages: [
          {
            "source-table": PRODUCTS_ID,
            filters: [["=", expect.anything(), expect.anything(), "Widget"]],
          },
        ],
      });

      response.resolve(createMockDataset());
      await waitFor(() =>
        expect(
          screen.queryByTestId("loading-indicator"),
        ).not.toBeInTheDocument(),
      );
    });
  });

  describe("sorting in the raw table mode (metabase#42723)", () => {
    const LINE_CARD = createMockCard({
      id: 42723,
      name: "Products by month and category",
      display: "line",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: PRODUCTS_ID },
              aggregations: [{ type: "operator", operator: "count", args: [] }],
              breakouts: [
                { type: "column", name: "CREATED_AT", unit: "month" },
                { type: "column", name: "CATEGORY" },
              ],
            },
          ],
        }),
      ),
    });

    const COLS = [
      createMockColumn({
        name: "CREATED_AT",
        display_name: "Created At: Month",
        source: "breakout",
        field_ref: [
          "field",
          PRODUCTS.CREATED_AT,
          { "base-type": "type/DateTime", "temporal-unit": "month" },
        ],
        base_type: "type/DateTime",
        effective_type: "type/DateTime",
        unit: "month",
      }),
      createMockColumn({
        name: "CATEGORY",
        display_name: "Category",
        source: "breakout",
        field_ref: ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
        base_type: "type/Text",
        effective_type: "type/Text",
      }),
      createMockColumn({
        id: undefined,
        table_id: undefined,
        name: "count",
        display_name: "Count",
        source: "aggregation",
        field_ref: ["aggregation", 0],
        base_type: "type/BigInteger",
        effective_type: "type/BigInteger",
      }),
    ];

    const DATASET = createMockDataset({
      data: createMockDatasetData({
        rows: [
          ["2027-01-01T00:00:00Z", "Gadget", 7],
          ["2027-02-01T00:00:00Z", "Widget", 3],
        ],
        cols: COLS,
      }),
    });

    const SORTED_DATASET = createMockDataset({
      data: createMockDatasetData({
        rows: [
          ["2027-02-01T00:00:00Z", "Widget", 3],
          ["2027-01-01T00:00:00Z", "Gadget", 7],
        ],
        cols: COLS,
      }),
    });

    function isSortedByCountQuery(call: CallLog) {
      const body: unknown = JSON.parse(String(call.options.body));
      return JSON.stringify(body).includes('"order-by":[["asc"');
    }

    mockGetBoundingClientRect({ width: 1000, height: 800 });

    it("keeps the line chart after sorting by a column in the data view", async () => {
      await setup({ card: LINE_CARD, dataset: DATASET });
      fetchMock.modifyRoute("dataset-post", {
        response: (call: CallLog) =>
          isSortedByCountQuery(call) ? SORTED_DATASET : DATASET,
      });
      expect(await screen.findByTestId("chart-container")).toBeInTheDocument();

      await userEvent.click(screen.getByLabelText("Switch to data"));
      const headerCell = await screen.findByRole("columnheader", {
        name: "Count",
      });
      await userEvent.click(within(headerCell).getByText("Count"));
      await userEvent.click(
        await screen.findByTestId("click-actions-sort-control-sort.ascending"),
      );

      await waitFor(() =>
        expect(
          within(
            screen.getByRole("columnheader", { name: /Count/ }),
          ).getByLabelText("chevronup icon"),
        ).toBeInTheDocument(),
      );
      const runCall = checkNotNull(
        fetchMock.callHistory.lastCall("path:/api/dataset", { method: "POST" }),
      );
      const runBody: unknown = JSON.parse(String(runCall.options.body));
      expect(runBody).toMatchObject({
        stages: [
          {
            "source-table": PRODUCTS_ID,
            "order-by": [
              [
                "asc",
                expect.anything(),
                ["aggregation", expect.anything(), expect.anything()],
              ],
            ],
          },
        ],
      });
      await userEvent.click(screen.getByLabelText("Switch to visualization"));
      expect(await screen.findByTestId("chart-container")).toBeInTheDocument();
      expect(
        screen.queryByRole("columnheader", { name: /Count/ }),
      ).not.toBeInTheDocument();
    });
  });

  describe("new column shortcuts in the data view", () => {
    const SERIES_COLOR = "#F2A86F";
    const LINE_CARD = createMockCard({
      id: 3,
      name: "Orders by month",
      display: "line",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              aggregations: [{ type: "operator", operator: "count", args: [] }],
              breakouts: [
                { type: "column", name: "CREATED_AT", unit: "month" },
              ],
            },
          ],
        }),
      ),
      visualization_settings: {
        "graph.metrics": ["count"],
        "graph.dimensions": ["CREATED_AT"],
        // a setting that differs from the default, so that the chart shows
        // whether the saved settings were kept
        series_settings: { count: { color: SERIES_COLOR } },
      },
    });

    const CREATED_AT_MONTH_COLUMN = createOrdersCreatedAtDatasetColumn({
      display_name: "Created At: Month",
      source: "breakout",
      unit: "month",
      field_ref: ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
    });

    const COUNT_COLUMN = createMockColumn({
      name: "count",
      display_name: "Count",
      base_type: "type/BigInteger",
      effective_type: "type/BigInteger",
      semantic_type: "type/Quantity",
      source: "aggregation",
      field_ref: ["aggregation", 0],
    });

    const createExpressionColumn = (name: string, baseType: string) =>
      createMockColumn({
        id: undefined,
        table_id: undefined,
        name,
        display_name: name,
        base_type: baseType,
        effective_type: baseType,
        source: "fields",
        field_ref: ["expression", name],
      });

    const ROWS = [
      ["2026-01-01T00:00:00Z", 10],
      ["2026-02-01T00:00:00Z", 20],
      ["2026-03-01T00:00:00Z", 30],
    ];

    const LINE_DATASET = createMockDataset({
      data: createMockDatasetData({
        cols: [CREATED_AT_MONTH_COLUMN, COUNT_COLUMN],
        rows: ROWS,
      }),
      row_count: ROWS.length,
    });

    // the shortcuts add a stage, and the query processor returns the columns
    // of the first stage as fields of the second one
    const createSecondStageDataset = (
      expressionColumns: ReturnType<typeof createExpressionColumn>[],
      expressionValues: (rowIndex: number) => (string | number)[],
    ) =>
      createMockDataset({
        data: createMockDatasetData({
          cols: [
            {
              ...CREATED_AT_MONTH_COLUMN,
              source: "fields",
              field_ref: [
                "field",
                "CREATED_AT",
                { "base-type": "type/DateTime", "temporal-unit": "month" },
              ],
            },
            {
              ...COUNT_COLUMN,
              source: "fields",
              field_ref: ["field", "count", { "base-type": "type/BigInteger" }],
            },
            ...expressionColumns,
          ],
          rows: ROWS.map((row, index) => [...row, ...expressionValues(index)]),
        }),
        row_count: ROWS.length,
      });

    const getRunBodies = () =>
      fetchMock.callHistory
        .calls("path:/api/dataset", { method: "POST" })
        .map((call) => JSON.parse(String(call.options.body)));

    const isExtractRun = (body: string) =>
      body.includes('"get-year"') && !body.includes('"concat"');
    const isCombineRun = (body: string) =>
      body.includes('"get-year"') && body.includes('"concat"');

    mockGetBoundingClientRect({ width: 1000, height: 800 });

    let documentHiddenSpy: jest.SpyInstance | undefined;

    beforeEach(() => {
      // A finished run resets the favicon 3 seconds later, unless the page is
      // hidden. The steps here take longer than that, and the reset would
      // update the page outside of act().
      documentHiddenSpy = jest
        .spyOn(document, "hidden", "get")
        .mockReturnValue(true);
    });

    afterEach(() => {
      documentHiddenSpy?.mockRestore();
    });

    it("should keep the chart settings after adding columns from the data view (metabase#43294)", async () => {
      await setup({ card: LINE_CARD, dataset: LINE_DATASET });
      const yearColumn = createExpressionColumn("Year", "type/Integer");
      const combinedColumn = createExpressionColumn(
        "Combined Created At: Month, Count",
        "type/Text",
      );
      fetchMock.modifyRoute("dataset-post", {
        response: (call: CallLog) => {
          const body = String(call.options.body);
          if (isCombineRun(body)) {
            return createSecondStageDataset(
              [yearColumn, combinedColumn],
              (index) => [2026, `${ROWS[index][0]} ${ROWS[index][1]}`],
            );
          }
          if (isExtractRun(body)) {
            return createSecondStageDataset([yearColumn], () => [2026]);
          }
          return { status: 400, body: { message: "unexpected query" } };
        },
      });

      await userEvent.click(screen.getByLabelText("Switch to data"));

      await userEvent.click(
        await screen.findByRole("button", { name: "Add column" }),
      );
      await userEvent.click(await screen.findByText("Extract part of column"));
      const extractPopover = await screen.findByRole("dialog");
      await userEvent.click(
        await within(extractPopover).findByText("Created At: Month"),
      );
      await userEvent.click(await within(extractPopover).findByText("Year"));

      expect(
        await screen.findByRole("columnheader", { name: "Year" }),
      ).toBeInTheDocument();
      expect(getRunBodies()).toHaveLength(1);
      expect(getRunBodies()[0]).toMatchObject({
        stages: [
          {
            "source-table": ORDERS_ID,
            aggregation: [["count", expect.anything()]],
            breakout: [
              [
                "field",
                expect.objectContaining({ "temporal-unit": "month" }),
                ORDERS.CREATED_AT,
              ],
            ],
          },
          {
            expressions: [
              [
                "get-year",
                { "lib/expression-name": "Year" },
                [
                  "field",
                  expect.objectContaining({
                    "inherited-temporal-unit": "month",
                  }),
                  "CREATED_AT",
                ],
              ],
            ],
          },
        ],
      });

      await userEvent.click(screen.getByRole("button", { name: "Add column" }));
      await userEvent.click(await screen.findByText("Combine columns"));
      await userEvent.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: "Done",
        }),
      );

      expect(
        await screen.findByRole("columnheader", {
          name: "Combined Created At: Month, Count",
        }),
      ).toBeInTheDocument();
      expect(getRunBodies()).toHaveLength(2);
      expect(getRunBodies()[1]).toMatchObject({
        stages: [
          { "source-table": ORDERS_ID },
          {
            expressions: [
              [
                "get-year",
                { "lib/expression-name": "Year" },
                expect.anything(),
              ],
              [
                "concat",
                {
                  "lib/expression-name": "Combined Created At: Month, Count",
                },
                ["field", expect.anything(), "CREATED_AT"],
                " ",
                ["field", expect.anything(), "count"],
              ],
            ],
          },
        ],
      });

      await userEvent.click(screen.getByLabelText("Switch to visualization"));
      await waitFor(() =>
        expect(screen.getByDisplayValue("visualization")).toBeChecked(),
      );
      const chart = await screen.findByTestId("chart-container");
      await waitFor(() =>
        expect(within(chart).getByText("Count")).toBeInTheDocument(),
      );
      expect(within(chart).getByText("Created At: Month")).toBeInTheDocument();
      const seriesStrokes = Array.from(
        // eslint-disable-next-line testing-library/no-node-access -- ECharts draws the series line as SVG paths, with no role or label
        chart.querySelectorAll("path"),
        (path) => path.getAttribute("stroke"),
      );
      expect(seriesStrokes).toContain(SERIES_COLOR);
    });
  });

  describe("removing a filter of a previous stage", () => {
    const MULTI_STAGE_CARD = createMockCard({
      id: 2,
      name: "Multi-stage question",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              filters: [
                {
                  type: "operator",
                  operator: ">",
                  args: [
                    { type: "column", name: "SUBTOTAL" },
                    { type: "literal", value: 0 },
                  ],
                },
              ],
              aggregations: [
                {
                  type: "operator",
                  operator: "sum",
                  args: [{ type: "column", name: "TOTAL" }],
                },
              ],
              breakouts: [{ type: "column", name: "CREATED_AT", unit: "year" }],
            },
            {
              expressions: [
                {
                  name: "Double the fun",
                  value: {
                    type: "operator",
                    operator: "*",
                    args: [
                      { type: "column", name: "sum" },
                      { type: "literal", value: 2 },
                    ],
                  },
                },
              ],
            },
          ],
        }),
      ),
    });

    it("should hide the filter control and keep the custom column after removing the last filter (metabase#13857, metabase#14193)", async () => {
      await setup({
        card: MULTI_STAGE_CARD,
        database: createSampleDatabase({ auto_run_queries: true }),
      });

      const control = await screen.findByTestId("filters-visibility-control");
      expect(control).toHaveTextContent(/^1$/);
      await userEvent.click(control);
      const pill = await screen.findByText("Subtotal is greater than 0");
      await userEvent.click(within(pill).getByLabelText("Remove"));

      await waitFor(() =>
        expect(
          screen.queryByTestId("qb-filters-panel"),
        ).not.toBeInTheDocument(),
      );
      await waitFor(() =>
        expect(
          screen.queryByTestId("filters-visibility-control"),
        ).not.toBeInTheDocument(),
      );

      const runCall = await waitFor(() =>
        checkNotNull(
          fetchMock.callHistory.lastCall("path:/api/dataset", {
            method: "POST",
          }),
        ),
      );
      const runBody: unknown = JSON.parse(String(runCall.options.body));
      expect(runBody).toMatchObject({
        stages: [
          { "source-table": ORDERS_ID },
          {
            expressions: [
              [
                "*",
                { "lib/expression-name": "Double the fun" },
                expect.anything(),
                2,
              ],
            ],
          },
        ],
      });
      expect(runBody).toMatchObject({
        stages: [
          expect.not.objectContaining({ filters: expect.anything() }),
          expect.anything(),
        ],
      });
    });
  });
  describe("running a query after an empty result", () => {
    const FILTERED_CARD = createMockUnsavedCard({
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              filters: [
                {
                  type: "operator",
                  operator: ">",
                  args: [
                    { type: "column", name: "TOTAL" },
                    { type: "literal", value: 1000 },
                  ],
                },
              ],
            },
          ],
        }),
      ),
    });

    const EMPTY_DATASET = createMockDataset({
      data: createMockDatasetData({
        cols: [createOrdersIdDatasetColumn()],
        rows: [],
      }),
    });

    const NON_EMPTY_DATASET = createMockDataset({
      data: createMockDatasetData({
        cols: [createOrdersIdDatasetColumn()],
        rows: [[1], [2]],
      }),
      row_count: 2,
    });

    it("should not show 'No results' while the next query runs (metabase#41464)", async () => {
      await setup({
        card: FILTERED_CARD,
        dataset: EMPTY_DATASET,
        database: createSampleDatabase({ auto_run_queries: true }),
      });

      expect(await screen.findByText("No results")).toBeInTheDocument();

      const response = defer<Dataset>();
      fetchMock.modifyRoute("dataset-post", {
        response: () => response.promise,
      });

      const pill = screen.getByTestId("filter-pill");
      expect(pill).toHaveTextContent("Total is greater than 1000");
      await userEvent.click(within(pill).getByLabelText("Remove"));

      const main = screen.getByTestId("query-builder-main");
      expect(
        await within(main).findByTestId("loading-indicator"),
      ).toBeInTheDocument();
      expect(within(main).queryByText("No results")).not.toBeInTheDocument();

      response.resolve(NON_EMPTY_DATASET);
      expect(await screen.findByText("Showing 2 rows")).toBeInTheDocument();
      expect(
        within(main).queryByTestId("loading-indicator"),
      ).not.toBeInTheDocument();
    });
  });
  describe("saving a chart from the raw table view", () => {
    mockGetBoundingClientRect({ width: 1000, height: 800 });

    const LINE_CARD = createMockUnsavedCard({
      display: "line",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              aggregations: [{ type: "operator", operator: "count", args: [] }],
              breakouts: [
                { type: "column", name: "CREATED_AT", unit: "month" },
              ],
            },
          ],
        }),
      ),
      visualization_settings: {},
    });

    const LINE_DATASET = createMockDataset({
      data: createMockDatasetData({
        cols: [
          createOrdersCreatedAtDatasetColumn({
            source: "breakout",
            unit: "month",
            display_name: "Created At: Month",
            field_ref: [
              "field",
              ORDERS.CREATED_AT,
              { "base-type": "type/DateTime", "temporal-unit": "month" },
            ],
          }),
          createMockColumn({
            name: "count",
            display_name: "Count",
            source: "aggregation",
            base_type: "type/BigInteger",
            effective_type: "type/BigInteger",
            semantic_type: "type/Quantity",
            field_ref: ["aggregation", 0],
          }),
        ],
        rows: [
          ["2025-04-01T00:00:00Z", 1],
          ["2025-05-01T00:00:00Z", 19],
        ],
      }),
      row_count: 2,
    });

    it("should save the chart settings when the question is saved from the raw table view (metabase#41612)", async () => {
      fetchMock.post("path:/api/card", (call: CallLog) =>
        createMockCard({
          ...JSON.parse(String(call.options.body)),
          id: 41612,
        }),
      );
      setupCardQueryMetadataEndpoint(
        createMockCard({ id: 41612 }),
        createMockCardQueryMetadata({ databases: [createSampleDatabase()] }),
      );
      const { router } = await setup({
        card: LINE_CARD,
        dataset: LINE_DATASET,
        database: createSampleDatabase({ auto_run_queries: true }),
      });

      await userEvent.click(await screen.findByLabelText("Switch to data"));
      expect(
        await screen.findByRole("columnheader", { name: "Created At: Month" }),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      const modal = await screen.findByTestId("save-question-modal");
      await waitFor(() =>
        expect(
          within(modal).getByLabelText(/Where do you want to save this/),
        ).toHaveTextContent("Our analytics"),
      );
      await userEvent.click(
        within(modal).getByRole("button", { name: "Save" }),
      );

      const createCall = await waitFor(() =>
        checkNotNull(
          fetchMock.callHistory.lastCall("path:/api/card", { method: "POST" }),
        ),
      );
      const createdCard: unknown = JSON.parse(String(createCall.options.body));
      expect(createdCard).toMatchObject({
        display: "line",
        visualization_settings: {
          "graph.metrics": ["count"],
          "graph.dimensions": ["CREATED_AT"],
        },
      });
      await waitFor(() =>
        expect(router.location.pathname).toMatch(/^\/question\/41612/),
      );
    });
  });
  describe("removing the first aggregation of a query with a later stage", () => {
    mockGetBoundingClientRect({ width: 1000, height: 800 });

    const sumOf = (name: string) => ({
      type: "operator" as const,
      operator: "sum",
      args: [{ type: "column" as const, name }],
    });

    const createAggregatedQuery = () => {
      const query = Lib.appendStage(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              aggregations: [sumOf("SUBTOTAL"), sumOf("TAX"), sumOf("TOTAL")],
              breakouts: [{ type: "column", name: "CREATED_AT", unit: "week" }],
            },
          ],
        }),
      );
      const sumOfTax = checkNotNull(
        Lib.filterableColumns(query, 1).find(
          (column) =>
            Lib.displayInfo(query, 1, column).displayName === "Sum of Tax",
        ),
      );
      return Lib.filter(
        query,
        1,
        Lib.numberFilterClause({
          operator: ">",
          column: sumOfTax,
          values: [100],
        }),
      );
    };

    const AGGREGATED_CARD = createMockUnsavedCard({
      display: "table",
      dataset_query: Lib.toJsQuery(createAggregatedQuery()),
    });

    // Columns of a previous stage come back with the "fields" source
    const createSumColumn = (name: string, displayName: string) =>
      createMockColumn({
        name,
        display_name: displayName,
        source: "fields",
        base_type: "type/Float",
        effective_type: "type/Float",
        field_ref: ["field", name, { "base-type": "type/Float" }],
      });

    const createWeekColumn = () =>
      createOrdersCreatedAtDatasetColumn({
        source: "fields",
        unit: "week",
        display_name: "Created At: Week",
        field_ref: [
          "field",
          "CREATED_AT",
          { "base-type": "type/DateTime", "temporal-unit": "week" },
        ],
      });

    const FILTERED_ROW_COUNT = 175;

    const FILTERED_BY_TAX_DATASET = createMockDataset({
      data: createMockDatasetData({
        cols: [
          createWeekColumn(),
          createSumColumn("sum", "Sum of Tax"),
          createSumColumn("sum_2", "Sum of Total"),
        ],
        rows: Array.from({ length: FILTERED_ROW_COUNT }, (_, index) => [
          `2025-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`,
          101 + index,
          1000 + index,
        ]),
      }),
      row_count: FILTERED_ROW_COUNT,
    });

    const EMPTY_DATASET = createMockDataset({
      data: createMockDatasetData({
        cols: [createWeekColumn()],
        rows: [],
      }),
    });

    const isFilteredByTax = (call: CallLog) => {
      const body = getRequestBody(call);
      const aggregations = getIn(body, ["stages", 0, "aggregation"]);
      const aggregatedFieldIds = Array.isArray(aggregations)
        ? aggregations.map((aggregation) => getIn(aggregation, [2, 2]))
        : [];
      const filter = getIn(body, ["stages", 1, "filters", 0]);
      return (
        _.isEqual(aggregatedFieldIds, [ORDERS.TAX, ORDERS.TOTAL]) &&
        getIn(filter, [0]) === ">" &&
        getIn(filter, [2, 2]) === "sum" &&
        getIn(filter, [3]) === 100
      );
    };

    it("should not re-target the filter of the next stage (metabase#12679)", async () => {
      await setup({
        card: AGGREGATED_CARD,
        dataset: EMPTY_DATASET,
        initialRoute: `/question/notebook#${serializeCardForUrl(AGGREGATED_CARD)}`,
      });
      fetchMock.modifyRoute("dataset-post", {
        response: (call: CallLog) =>
          isFilteredByTax(call) ? FILTERED_BY_TAX_DATASET : EMPTY_DATASET,
      });

      const filterStep = await screen.findByTestId("step-filter-1-0");
      expect(
        within(filterStep).getByText("Sum of Tax is greater than 100"),
      ).toBeInTheDocument();

      const summarizeStep = screen.getByTestId("step-summarize-0-0");
      const subtotalItem = checkNotNull(
        within(summarizeStep)
          .getAllByTestId("notebook-cell-item")
          .find((item) => item.textContent === "Sum of Subtotal"),
      );
      await userEvent.click(within(subtotalItem).getByLabelText("close icon"));

      await waitFor(() =>
        expect(
          within(summarizeStep).queryByText("Sum of Subtotal"),
        ).not.toBeInTheDocument(),
      );
      expect(within(summarizeStep).getByText("Sum of Tax")).toBeInTheDocument();
      expect(
        within(screen.getByTestId("step-filter-1-0")).getByText(
          "Sum of Tax is greater than 100",
        ),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Visualize" }));

      expect(
        await screen.findByText(`Showing ${FILTERED_ROW_COUNT} rows`),
      ).toBeInTheDocument();
      const runCall = checkNotNull(
        fetchMock.callHistory.lastCall("path:/api/dataset", { method: "POST" }),
      );
      expect(isFilteredByTax(runCall)).toBe(true);

      const filtersControl = await screen.findByTestId(
        "filters-visibility-control",
      );
      if (screen.queryByTestId("qb-filters-panel") == null) {
        await userEvent.click(filtersControl);
      }
      expect(
        await within(await screen.findByTestId("qb-filters-panel")).findByText(
          "Sum of Tax is greater than 100",
        ),
      ).toBeInTheDocument();

      expect(
        await screen.findByRole("columnheader", { name: "Sum of Tax" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("columnheader", { name: "Sum of Total" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("columnheader", { name: "Sum of Subtotal" }),
      ).not.toBeInTheDocument();
    });
  });
  describe("chart settings after adding a query stage", () => {
    mockGetBoundingClientRect({ width: 1000, height: 800 });

    const STATE_COUNTS: [string, number][] = [
      ["AK", 68],
      ["AL", 56],
      ["AR", 49],
      ["AZ", 20],
      ["CA", 90],
    ];

    const BAR_CARD = createMockCard({
      id: 44668,
      name: "Count by state",
      display: "bar",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: PEOPLE_ID },
              aggregations: [{ type: "operator", operator: "count", args: [] }],
              breakouts: [{ type: "column", name: "STATE" }],
              limit: 5,
            },
          ],
        }),
      ),
      visualization_settings: {
        "graph.metrics": ["count"],
        "graph.dimensions": ["STATE"],
      },
    });

    const createCountColumn = (source: "aggregation" | "fields") =>
      createMockColumn({
        name: "count",
        display_name: "Count",
        source,
        base_type: "type/BigInteger",
        effective_type: "type/BigInteger",
        semantic_type: "type/Quantity",
        field_ref:
          source === "aggregation"
            ? ["aggregation", 0]
            : ["field", "count", { "base-type": "type/BigInteger" }],
      });

    const BAR_DATASET = createMockDataset({
      data: createMockDatasetData({
        cols: [
          createPeopleStateDatasetColumn({ source: "breakout" }),
          createCountColumn("aggregation"),
        ],
        rows: STATE_COUNTS,
      }),
      row_count: STATE_COUNTS.length,
    });

    const STAGED_DATASET = createMockDataset({
      data: createMockDatasetData({
        cols: [
          createPeopleStateDatasetColumn({
            field_ref: ["field", "STATE", { "base-type": "type/Text" }],
          }),
          createCountColumn("fields"),
          createMockColumn({
            name: "Custom String",
            display_name: "Custom String",
            source: "fields",
            base_type: "type/Text",
            effective_type: "type/Text",
            field_ref: ["expression", "Custom String"],
          }),
          createMockColumn({
            name: "Custom Number",
            display_name: "Custom Number",
            source: "fields",
            base_type: "type/BigInteger",
            effective_type: "type/BigInteger",
            field_ref: ["expression", "Custom Number"],
          }),
        ],
        rows: STATE_COUNTS.map(([state, count]) => [
          state,
          count,
          `abc_${count}`,
          count * 2,
        ]),
      }),
      row_count: STATE_COUNTS.length,
    });

    // Matches `concat("abc_", [Count])` named "Custom String" and
    // `[Count] * 2` named "Custom Number", both on the count of stage 0
    const hasCustomColumnStage = (call: CallLog) => {
      const expressions = getIn(getRequestBody(call), [
        "stages",
        1,
        "expressions",
      ]);
      if (!Array.isArray(expressions) || expressions.length !== 2) {
        return false;
      }
      const [customString, customNumber] = expressions;
      const isCountRef = (ref: unknown) =>
        getIn(ref, [0]) === "field" && getIn(ref, [2]) === "count";
      return (
        getIn(customString, [0]) === "concat" &&
        getIn(customString, [1, "lib/expression-name"]) === "Custom String" &&
        getIn(customString, [2]) === "abc_" &&
        isCountRef(getIn(customString, [3])) &&
        getIn(customString, ["length"]) === 4 &&
        getIn(customNumber, [0]) === "*" &&
        getIn(customNumber, [1, "lib/expression-name"]) === "Custom Number" &&
        isCountRef(getIn(customNumber, [2])) &&
        getIn(customNumber, [3]) === 2 &&
        getIn(customNumber, ["length"]) === 4
      );
    };

    const addCustomColumn = async (formula: string, name: string) => {
      const input = await screen.findByTestId("custom-expression-query-editor");
      await waitFor(() => expect(input).toHaveProperty("readOnly", false));
      await userEvent.click(input);
      await userEvent.paste(formula);
      await userEvent.tab();
      await userEvent.type(screen.getByTestId("expression-name"), name);
      const doneButton = screen.getByRole("button", { name: "Done" });
      await waitFor(() => expect(doneButton).toBeEnabled());
      await userEvent.click(doneButton);
      await waitFor(() =>
        expect(
          screen.queryByTestId("expression-editor"),
        ).not.toBeInTheDocument(),
      );
    };

    const getChart = () => screen.findByTestId("chart-container");
    const getMain = () => screen.getByTestId("query-builder-main");
    const getSidebar = () => screen.getByTestId("chartsettings-sidebar");

    it("should not drop graph.metrics after adding a new query stage (metabase#44668)", async () => {
      await setup({
        card: BAR_CARD,
        dataset: BAR_DATASET,
        database: createSampleDatabase({ auto_run_queries: true }),
      });
      fetchMock.modifyRoute("dataset-post", {
        response: (call: CallLog) =>
          hasCustomColumnStage(call) ? STAGED_DATASET : BAR_DATASET,
      });

      await userEvent.click(screen.getByTestId("notebook-button"));
      const actionButtons = await screen.findAllByTestId("action-buttons");
      await userEvent.click(
        within(actionButtons[actionButtons.length - 1]).getByRole("button", {
          name: /Custom column/,
        }),
      );
      await addCustomColumn('concat("abc_", [Count])', "Custom String");
      await userEvent.click(
        within(await screen.findByTestId("step-expression-1-0")).getByLabelText(
          "add icon",
        ),
      );
      await addCustomColumn("[Count] * 2", "Custom Number");
      await userEvent.click(screen.getByRole("button", { name: "Visualize" }));
      await waitFor(() =>
        expect(
          fetchMock.callHistory
            .calls("path:/api/dataset", { method: "POST" })
            .some(hasCustomColumnStage),
        ).toBe(true),
      );
      await act(() => fetchMock.callHistory.flush(true));

      await waitFor(async () =>
        expect(within(await getChart()).getByText("State")).toBeInTheDocument(),
      );
      const chart = await getChart();
      expect(within(chart).getByText("Count")).toBeInTheDocument();
      for (const [state] of STATE_COUNTS) {
        expect(within(chart).getByText(state)).toBeInTheDocument();
      }
      expect(
        within(getMain()).queryByLabelText("Legend"),
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByTestId("viz-settings-button"));
      await userEvent.click(
        await within(getSidebar()).findByText("Add another series"),
      );
      const legend = await within(getMain()).findByLabelText("Legend");
      expect(within(legend).getByText("Count")).toBeInTheDocument();
      expect(within(legend).getByText("Custom Number")).toBeInTheDocument();
      expect(
        within(getSidebar()).queryByText("Add another series"),
      ).not.toBeInTheDocument();
      expect(
        within(getSidebar()).queryByText("Add series breakout"),
      ).not.toBeInTheDocument();

      await userEvent.click(
        within(getSidebar()).getByTestId("remove-Custom Number"),
      );
      await waitFor(() =>
        expect(
          within(getMain()).queryByLabelText("Legend"),
        ).not.toBeInTheDocument(),
      );

      await userEvent.click(
        within(getSidebar()).getByText("Add series breakout"),
      );
      const listbox = await screen.findByRole("listbox");
      expect(
        within(listbox).getByRole("option", { name: "Count" }),
      ).toBeInTheDocument();
      expect(
        within(listbox).getByRole("option", { name: "Custom Number" }),
      ).toBeInTheDocument();
      await userEvent.click(
        within(listbox).getByRole("option", { name: "Custom String" }),
      );

      const breakoutLegend = await within(getMain()).findByLabelText("Legend");
      for (const [, count] of STATE_COUNTS) {
        expect(
          within(breakoutLegend).getByText(`abc_${count}`),
        ).toBeInTheDocument();
      }
      expect(
        within(getSidebar()).queryByText("Add another series"),
      ).not.toBeInTheDocument();
      expect(
        within(getSidebar()).queryByText("Add series breakout"),
      ).not.toBeInTheDocument();
    });
  });
  describe("chart settings after removing query clauses", () => {
    mockGetBoundingClientRect({ width: 1000, height: 800 });

    const countByMonthStage: TestStageWithSourceSpec = {
      source: { type: "table", id: ORDERS_ID },
      aggregations: [{ type: "operator", operator: "count", args: [] }],
      breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
    };

    const WATERFALL_CARD = createMockCard({
      id: 36027,
      name: "Waterfall",
      display: "waterfall",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            countByMonthStage,
            {
              joins: [
                {
                  source: { type: "table", id: ORDERS_ID },
                  strategy: "left-join",
                  conditions: [
                    {
                      operator: "<=",
                      left: { type: "column", name: "CREATED_AT" },
                      right: { type: "column", name: "CREATED_AT" },
                    },
                  ],
                },
              ],
              aggregations: [
                {
                  type: "operator",
                  operator: "sum",
                  args: [{ type: "column", name: "count" }],
                },
              ],
              breakouts: [
                { type: "column", name: "CREATED_AT", unit: "month" },
              ],
            },
          ],
        }),
      ),
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["sum"],
      },
    });

    const createMonthColumn = () =>
      createOrdersCreatedAtDatasetColumn({
        source: "breakout",
        unit: "month",
        display_name: "Created At: Month",
        field_ref: [
          "field",
          ORDERS.CREATED_AT,
          { "base-type": "type/DateTime", "temporal-unit": "month" },
        ],
      });

    const createNumberColumn = (name: string, displayName: string) =>
      createMockColumn({
        name,
        display_name: displayName,
        source: "aggregation",
        base_type: "type/BigInteger",
        effective_type: "type/BigInteger",
        field_ref: ["aggregation", 0],
      });

    // 48 months from April 2025 that add up to 18,760 orders
    const MONTHLY_ROWS = Array.from({ length: 48 }, (_, index) => [
      new Date(Date.UTC(2025, 3 + index, 1)).toISOString(),
      index < 40 ? 400 : 345,
    ]);

    const WATERFALL_DATASET = createMockDataset({
      data: createMockDatasetData({
        cols: [createMonthColumn(), createNumberColumn("sum", "Sum of Count")],
        rows: MONTHLY_ROWS,
      }),
      row_count: MONTHLY_ROWS.length,
    });

    const COUNT_DATASET = createMockDataset({
      data: createMockDatasetData({
        cols: [createMonthColumn(), createNumberColumn("count", "Count")],
        rows: MONTHLY_ROWS,
      }),
      row_count: MONTHLY_ROWS.length,
    });

    const isCountByMonthQuery = (call: CallLog) => {
      const body = getRequestBody(call);
      const stages = getIn(body, ["stages"]);
      return (
        Array.isArray(stages) &&
        stages.length === 1 &&
        getIn(body, ["stages", 0, "aggregation", 0, 0]) === "count" &&
        getIn(body, ["stages", 0, "breakout", 0, 1, "temporal-unit"]) ===
          "month" &&
        getIn(body, ["stages", 0, "joins"]) == null
      );
    };

    const removeStep = async (testId: string) => {
      const step = await screen.findByTestId(testId);
      await userEvent.click(within(step).getByLabelText("Remove step"));
      await waitFor(() =>
        expect(screen.queryByTestId(testId)).not.toBeInTheDocument(),
      );
    };

    it("should use default metrics and dimensions if they are missing after removing some query clauses (metabase#36027)", async () => {
      await setup({
        card: WATERFALL_CARD,
        dataset: WATERFALL_DATASET,
        database: createSampleDatabase({ auto_run_queries: true }),
      });
      fetchMock.modifyRoute("dataset-post", {
        response: (call: CallLog) =>
          isCountByMonthQuery(call) ? COUNT_DATASET : WATERFALL_DATASET,
      });

      await userEvent.click(screen.getByTestId("notebook-button"));
      await removeStep("step-summarize-1-0");
      await removeStep("step-join-1-0");
      await userEvent.click(screen.getByRole("button", { name: "Visualize" }));
      await waitFor(() =>
        expect(
          fetchMock.callHistory
            .calls("path:/api/dataset", { method: "POST" })
            .some(isCountByMonthQuery),
        ).toBe(true),
      );
      await act(() => fetchMock.callHistory.flush(true));

      const chart = await screen.findByTestId("chart-container");
      await waitFor(() =>
        expect(
          within(chart).getByText("Created At: Month"),
        ).toBeInTheDocument(),
      );
      expect(within(chart).getByText("Count")).toBeInTheDocument();
      for (const month of [
        "April 2025",
        "April 2026",
        "April 2027",
        "April 2028",
      ]) {
        expect(within(chart).getByText(month)).toBeInTheDocument();
      }
      for (const tick of [
        "0",
        "3,000",
        "6,000",
        "9,000",
        "12,000",
        "15,000",
        "18,000",
        "21,000",
      ]) {
        expect(within(chart).getByText(tick)).toBeInTheDocument();
      }
    });
  });
});

function getRequestBody(call: CallLog): unknown {
  return JSON.parse(String(call.options.body));
}

/** Reads a nested value of a request body, or undefined when it is missing */
function getIn(value: unknown, path: (string | number)[]): unknown {
  return path.reduce<unknown>(
    (current, key) =>
      current != null && typeof current === "object" && key in current
        ? Reflect.get(current, key)
        : undefined,
    value,
  );
}

/**
 * echarts keeps the first 2D canvas context it measures text with, and the
 * file's `afterEach` resets every mock, including the `jest.fn` methods
 * jest-canvas-mock puts on that context. A chart rendered after another chart
 * then measures text as `undefined` and never settles. This makes echarts
 * measure text with a new context of the current document on each call.
 * echarts stays loaded after this file when the test runner keeps packages
 * loaded between files, so the function must not keep a context of this file.
 */
function setupCanvasTextMeasurement() {
  beforeEach(() => {
    setPlatformAPI({
      measureText: (text: string, font?: string) => {
        const context = checkNotNull(
          document.createElement("canvas").getContext("2d"),
        );
        context.font = font ?? "12px sans-serif";
        return context.measureText(text);
      },
    });
  });
}
