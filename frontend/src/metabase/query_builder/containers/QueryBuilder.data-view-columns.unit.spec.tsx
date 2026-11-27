import { EditorView } from "@codemirror/view";
import userEvent from "@testing-library/user-event";
import { setPlatformAPI } from "echarts/core";
import fetchMock, { type CallLog } from "fetch-mock";
import { setupJestCanvasMock } from "jest-canvas-mock";

import { act, fireEvent, screen, waitFor, within } from "__support__/ui";
import { mockGetBoundingClientRect } from "__support__/utils";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  createOrdersCreatedAtDatasetColumn,
  createOrdersIdDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { setup } from "./test-utils";

jest.unmock("@uiw/react-codemirror");

registerVisualizations();

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

afterEach(() => {
  jest.resetAllMocks();
  setupJestCanvasMock();
});

describe("new column shortcuts in the data view", () => {
  const SERIES_COLOR = "#F2A86F";
  const COMBINED_COLUMN_NAME = 'concat(Created At: Month, " ", Count)';
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
            breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
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

  it("keeps a custom column's format and table position after editing its formula from the header", async () => {
    const originalName = "1 + 1";
    const updatedName = "1 + 2";
    const card = createMockCard({
      display: "table",
      dataset_query: Lib.toJsQuery(
        Lib.expression(
          Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
          -1,
          originalName,
          Lib.expressionClause("+", [1, 1]),
        ),
      ),
      visualization_settings: {
        "table.columns": [
          { name: originalName, enabled: true },
          { name: "ID", enabled: true },
        ],
        column_settings: {
          [getColumnKey({ name: originalName })]: { prefix: "£" },
        },
      },
    });
    const dataset = (name: string, value: number) =>
      createMockDataset({
        data: createMockDatasetData({
          cols: [
            createOrdersIdDatasetColumn(),
            createExpressionColumn(name, "type/Integer"),
          ],
          rows: [[1, value]],
        }),
        row_count: 1,
      });
    await setup({
      card,
      dataset: dataset(originalName, 2),
      database: createSampleDatabase({ auto_run_queries: true }),
    });
    fetchMock.modifyRoute("dataset-post", {
      response: dataset(updatedName, 3),
    });

    expect(await screen.findByText("£2")).toBeVisible();
    const header = screen.getByRole("columnheader", { name: originalName });
    const clickTarget = within(header).getByTestId("cell-data");
    fireEvent.mouseDown(clickTarget, { clientX: 0, clientY: 0 });
    fireEvent.mouseUp(clickTarget, { clientX: 0, clientY: 0 });
    await userEvent.click(await screen.findByText("Edit formula"));

    const editor = await screen.findByTestId("formula-editor");
    const view = EditorView.findFromDOM(
      await within(editor).findByRole("textbox"),
    );
    await waitFor(() => expect(view?.state.doc.toString()).toBe(originalName));
    if (view) {
      await act(async () => {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: updatedName },
          userEvent: "input.type",
        });
      });
    }
    await userEvent.click(
      within(editor).getByRole("button", { name: "Update" }),
    );

    expect(await screen.findByText("£3")).toBeVisible();
    const headers = screen.getAllByRole("columnheader", { name: /.+/ });
    expect(headers[0]).toHaveAccessibleName(updatedName);
    expect(headers[1]).toHaveAccessibleName("ID");
  });

  it("should keep the chart settings after adding columns from the data view (metabase#43294)", async () => {
    await setup({
      card: LINE_CARD,
      dataset: LINE_DATASET,
      // The formula bar runs a new column only on a database that runs queries as they change
      database: createSampleDatabase({ auto_run_queries: true }),
    });
    const yearColumn = createExpressionColumn("Year", "type/Integer");
    const combinedColumn = createExpressionColumn(
      COMBINED_COLUMN_NAME,
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

    const createdAtHeader = await screen.findByRole("columnheader", {
      name: "Created At: Month",
    });
    const headerClickTarget = within(createdAtHeader).getByTestId("cell-data");
    fireEvent.mouseDown(headerClickTarget, { clientX: 0, clientY: 0 });
    fireEvent.mouseUp(headerClickTarget, { clientX: 0, clientY: 0 });
    await userEvent.click(await screen.findByText("Extract day, month…"));
    await userEvent.click(await screen.findByText("Year"));

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
    const formulaEditor = await screen.findByTestId("formula-editor");
    const formulaTextbox = await within(formulaEditor).findByRole("textbox");
    const formulaView = EditorView.findFromDOM(formulaTextbox);
    expect(formulaView).not.toBeNull();
    if (formulaView) {
      const formula = 'concat([Created At: Month], " ", [Count])';
      await act(async () => {
        formulaView.dispatch({
          changes: { from: 0, insert: formula },
          selection: { anchor: formula.length },
          userEvent: "input.type",
        });
      });
    }
    await userEvent.click(
      within(formulaEditor).getByRole("button", { name: "Add column" }),
    );

    expect(
      await screen.findByRole("columnheader", {
        name: COMBINED_COLUMN_NAME,
      }),
    ).toBeInTheDocument();
    expect(getRunBodies()).toHaveLength(2);
    expect(getRunBodies()[1]).toMatchObject({
      stages: [
        { "source-table": ORDERS_ID },
        {
          expressions: [
            ["get-year", { "lib/expression-name": "Year" }, expect.anything()],
            [
              "concat",
              {
                "lib/expression-name": COMBINED_COLUMN_NAME,
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
