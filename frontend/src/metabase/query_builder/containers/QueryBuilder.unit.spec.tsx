import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";
import { setupJestCanvasMock } from "jest-canvas-mock";

import {
  setupLastDownloadFormatEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import {
  renderHook,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { mockGetBoundingClientRect } from "__support__/utils";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  createOrdersIdDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getQuestion } from "../store/selectors";

import {
  TEST_CARD,
  TEST_CARD_VISUALIZATION,
  TEST_MODEL_DATASET,
  TEST_NATIVE_CARD,
  TEST_NATIVE_CARD_DATASET,
  TEST_STRUCTURED_CARD,
  TEST_TIME_SERIES_WITH_CUSTOM_DATE_BREAKOUT_CARD,
  TEST_TIME_SERIES_WITH_DATE_BREAKOUT_CARD,
  setup,
  waitForFaviconReady,
} from "./test-utils";

registerVisualizations();

describe("QueryBuilder", () => {
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
      await setup({ card: TEST_CARD });

      await waitFor(() =>
        expect(document.title).toBe(`${TEST_CARD.name} · Metabase`),
      );
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
      expect(query?.native.query).toEqual("SELECT 1");
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
});
