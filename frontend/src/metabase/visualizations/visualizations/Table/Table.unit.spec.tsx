import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  act,
  fireEvent,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { QuestionChartSettings } from "metabase/visualizations/components/ChartSettings";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import { Table } from "metabase/visualizations/visualizations/Table/Table";
import {
  getComputedSettingsForSeries,
  loadVisualizationComponents,
} from "metabase/viz-core";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type {
  DatasetColumn,
  RowValues,
  Series,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCategoryColumn,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockNumericColumn,
  createMockSingleSeries,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  createOrdersTable,
  createOrdersTableDatasetColumns,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

registerVisualizations();

// Chart components are loaded on demand. Register them up front so each test
// renders in one pass and can be run on its own.
beforeAll(() => loadVisualizationComponents(["table"]));

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});
const ordersTable = createOrdersTable();
const ordersFields = ordersTable.fields ?? [];

type Display = Extract<VisualizationDisplay, "table" | "object">;

type SetupOptions = {
  display: Display;
  visualization_settings?: VisualizationSettings;
};

const setup = ({ display, visualization_settings = {} }: SetupOptions) => {
  const onChange = jest.fn();

  const Container = () => {
    const [question, setQuestion] = useState(
      new Question(
        {
          dataset_query: Lib.toJsQuery(
            Lib.createTestQuery(SAMPLE_PROVIDER, {
              stages: [{ source: { type: "table", id: ORDERS_ID } }],
            }),
          ),
          display,
          visualization_settings,
        },
        metadata,
      ),
    );

    const handleChange = (update: VisualizationSettings) => {
      onChange(update);
      setQuestion((q) => {
        const newQuestion = q.updateSettings(update);
        return new Question(newQuestion.card(), metadata);
      });
    };

    return (
      <QuestionChartSettings
        onChange={handleChange}
        series={[
          {
            card: question.card(),
            data: createMockDatasetData({
              rows: [],
              cols: ordersFields.map((field) =>
                createMockColumn({
                  ...field,
                  id: Number(field.id),
                  source: "fields",
                  field_ref: ["field", Number(field.id), null],
                }),
              ),
            }),
          },
        ]}
        initial={{ section: "Data" }}
        question={question}
      />
    );
  };

  renderWithProviders(<Container />);

  return { onChange };
};

// these visualizations share column settings, so all the tests should work for both
(["table", "object"] as const).forEach((display) => {
  describe(`${display} column settings`, () => {
    it("should show you related columns in structured queries", async () => {
      setup({ display });
      await userEvent.click(screen.getByText("Add or remove columns"));

      expect(screen.getByText("User")).toBeInTheDocument();
      expect(screen.getByText("Product")).toBeInTheDocument();

      const userColumList = screen.getByTestId("user-table-columns");

      expect(within(userColumList).getByLabelText("Address")).not.toBeChecked();
      expect(within(userColumList).getByLabelText("State")).not.toBeChecked();
    });

    it("should allow you to show and hide columns", async () => {
      setup({ display });
      await userEvent.click(await screen.findByTestId("Tax-hide-button"));

      expect(
        await screen.findByRole("listitem", { name: "Tax" }),
      ).toHaveAttribute("data-enabled", "false");

      await userEvent.click(await screen.findByTestId("Tax-show-button"));
      //If we can see the hide button, then we know it's been added back in.
      expect(await screen.findByTestId("Tax-hide-button")).toBeInTheDocument();
    });

    it("should allow you to update a column name", async () => {
      setup({ display });
      await userEvent.click(
        await screen.findByTestId("Subtotal-settings-button"),
      );
      await userEvent.type(
        await screen.findByDisplayValue("Subtotal"),
        " Updated",
      );
      await userEvent.click(await screen.findByText("Tax"));
      expect(await screen.findByText("Subtotal Updated")).toBeInTheDocument();
    });

    it("should rewrite field ref-based column_settings keys to name-based keys on update", async () => {
      const { onChange } = setup({
        display,
        visualization_settings: createMockVisualizationSettings({
          column_settings: {
            [JSON.stringify(["ref", ["field", ORDERS.TOTAL, null]])]: {
              column_title: "Total1",
            },
            [JSON.stringify(["ref", ["field", ORDERS.SUBTOTAL, null]])]: {
              column_title: "Subtotal1",
            },
          },
        }),
      });
      await userEvent.click(
        await screen.findByTestId("Subtotal1-settings-button"),
      );
      const input = await screen.findByDisplayValue("Subtotal1");
      await userEvent.clear(input);
      await userEvent.type(input, "Subtotal2");
      await userEvent.click(await screen.findByText("Total1"));
      expect(onChange).toHaveBeenCalledWith({
        column_settings: {
          [getColumnKey(createMockColumn({ name: "TOTAL" }))]: {
            column_title: "Total1",
          },
          [getColumnKey(createMockColumn({ name: "SUBTOTAL" }))]: {
            column_title: "Subtotal2",
          },
        },
      });
    });
  });
});

describe("table.pivot", () => {
  const createMockSeriesWithCols = (
    cols: string[],
    visualization_settings: VisualizationSettings = {},
  ): Series => [
    createMockSingleSeries(
      { visualization_settings },
      createMockDataset({
        data: createMockDatasetData({
          cols: cols.map((name) => createMockColumn({ name })),
        }),
      }),
    ),
  ];

  describe("getHidden", () => {
    const getHidden = Table.settings["table.pivot"].getHidden;
    if (!getHidden) {
      throw new Error("table.pivot getHidden should be defined");
    }

    it("should be hidden when there are fewer than 3 columns", () => {
      expect(getHidden(createMockSeriesWithCols(["dim1", "metric"]))).toBe(
        true,
      );
    });

    it("should not be hidden when there are 3 columns", () => {
      expect(
        getHidden(createMockSeriesWithCols(["dim1", "dim2", "metric"])),
      ).toBe(false);
    });

    it("should not be hidden when there are more than 3 columns (metabase#84401)", () => {
      expect(
        getHidden(createMockSeriesWithCols(["dim1", "dim2", "dim3", "metric"])),
      ).toBe(false);
    });
  });

  it.each([
    { shape: "an extra metric", cols: ["dim1", "dim2", "metric1", "metric2"] },
    { shape: "an extra dimension", cols: ["dim1", "dim2", "dim3", "metric"] },
  ])(
    "should keep a stored pivot when there is $shape (metabase#84401)",
    ({ cols }) => {
      const series = createMockSeriesWithCols(cols, { "table.pivot": true });

      expect(getComputedSettingsForSeries(series)["table.pivot"]).toBe(true);
    },
  );

  describe("rendering", () => {
    beforeAll(() => {
      mockGetBoundingClientRect();
    });

    const CATEGORY = createMockCategoryColumn({
      name: "CATEGORY",
      display_name: "Category",
    });
    const MONTH_LABEL = createMockCategoryColumn({
      name: "MONTH_LABEL",
      display_name: "Month label",
    });
    const MONTH_DATE = createMockColumn({
      name: "MONTH_DATE",
      display_name: "Month date",
      base_type: "type/DateTime",
      effective_type: "type/DateTime",
    });
    const TOTAL = createMockNumericColumn({
      name: "TOTAL",
      display_name: "Total",
    });

    type PivotSetupOpts = {
      cols: DatasetColumn[];
      rows: RowValues[];
    };

    const setupPivot = ({ cols, rows }: PivotSetupOpts) => {
      const onUpdateWarnings = jest.fn<void, [string[]]>();
      const series: Series = [
        {
          card: createMockCard({
            dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
              query: "",
            }),
            query_type: "native",
            display: "table",
            visualization_settings: {
              "table.pivot": true,
              "table.pivot_column": "MONTH_LABEL",
              "table.cell_column": "TOTAL",
            },
          }),
          ...createMockDataset({ data: { cols, rows } }),
        },
      ];

      renderWithProviders(
        <Visualization
          rawSeries={series}
          width={600}
          height={400}
          onUpdateWarnings={onUpdateWarnings}
        />,
      );

      return { onUpdateWarnings };
    };

    it("should pivot a native question with an extra column, using the first other column for rows (metabase#84401)", () => {
      setupPivot({
        cols: [CATEGORY, MONTH_LABEL, MONTH_DATE, TOTAL],
        rows: [
          ["Gadget", "2025-01", "2025-01-01T00:00:00Z", 10],
          ["Widget", "2025-01", "2025-01-01T00:00:00Z", 20],
          ["Gadget", "2025-02", "2025-02-01T00:00:00Z", 30],
          ["Widget", "2025-02", "2025-02-01T00:00:00Z", 40],
        ],
      });

      expect(
        screen.getAllByRole("columnheader").map((header) => header.textContent),
      ).toEqual(["Category", "2025-01", "2025-02"]);
      expect(
        screen
          .getAllByRole("row")
          .slice(1)
          .map((row) =>
            within(row)
              .getAllByRole("gridcell")
              .map((cell) => cell.textContent),
          ),
      ).toEqual([
        ["Gadget", "10", "30"],
        ["Widget", "20", "40"],
      ]);
    });

    it("should display a pivot table as a regular one when the pivot columns are missing (metabase#18976)", () => {
      // the columns of `select 'a', 'b'`, with pivot settings that name
      // columns the query does not return
      const series: Series = [
        {
          card: createMockCard({
            dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
              query: "select 'a', 'b'",
            }),
            query_type: "native",
            display: "table",
            visualization_settings: {
              "table.pivot": true,
              "table.pivot_column": "'a'",
              "table.cell_column": "1",
            },
          }),
          ...createMockDataset({
            data: {
              cols: [
                createMockCategoryColumn({ name: "'a'", display_name: "'a'" }),
                createMockCategoryColumn({ name: "'b'", display_name: "'b'" }),
              ],
              rows: [["a", "b"]],
            },
          }),
        },
      ];

      renderWithProviders(
        <Visualization rawSeries={series} width={600} height={400} />,
      );

      expect(
        screen.getAllByRole("columnheader").map((header) => header.textContent),
      ).toEqual(["", "'a'", "'b'"]);
      expect(
        within(screen.getByTestId("table-body"))
          .getAllByRole("gridcell")
          .map((cell) => cell.textContent),
      ).toEqual(["", "a", "b"]);
    });

    it("should not warn when each row and pivot value pair appears once (metabase#84401)", async () => {
      const { onUpdateWarnings } = setupPivot({
        cols: [CATEGORY, MONTH_LABEL, MONTH_DATE, TOTAL],
        rows: [
          ["Gadget", "2025-01", "2025-01-01T00:00:00Z", 10],
          ["Gadget", "2025-02", "2025-02-01T00:00:00Z", 30],
        ],
      });

      // Visualization applies reported warnings in an animation frame
      await act(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          ),
      );
      expect(onUpdateWarnings).toHaveBeenLastCalledWith([]);
    });

    it("should warn and show the last value when a row and pivot value pair appears more than once", async () => {
      const { onUpdateWarnings } = setupPivot({
        cols: [CATEGORY, MONTH_LABEL, TOTAL],
        rows: [
          ["Gadget", "2025-01", 10],
          ["Gadget", "2025-01", 20],
        ],
      });

      await waitFor(() =>
        expect(onUpdateWarnings).toHaveBeenLastCalledWith([
          'Some combinations of "Category" and "Month label" appear in more than one row. Each of those cells shows only the value from the last of these rows.',
        ]),
      );
      const [, firstRow] = screen.getAllByRole("row");
      expect(
        within(firstRow)
          .getAllByRole("gridcell")
          .map((cell) => cell.textContent),
      ).toEqual(["Gadget", "20"]);
    });
  });
});

describe("dashboard client-side sorting", () => {
  beforeAll(() => {
    mockGetBoundingClientRect();
  });

  it("sorts numeric, null, and text values in small datasets (#67756)", () => {
    const series = [
      createMockSingleSeries(
        { display: "table" },
        {
          data: {
            cols: [
              createMockNumericColumn({ display_name: "id", name: "id" }),
              createMockCategoryColumn({
                display_name: "name",
                name: "name",
              }),
            ],
            rows: [
              [1, "Alice"],
              [2, null],
              [3, "Charlie"],
              [4, null],
              [5, "Bob"],
              [6, null],
              [7, "Delta"],
              [8, null],
            ],
          },
        },
      ),
    ];

    renderWithProviders(
      <Visualization rawSeries={series} isDashboard width={600} height={400} />,
    );

    const idHeader = screen.getByRole("columnheader", { name: "id" });
    const idClickTarget = within(idHeader).getByTestId("cell-data");

    fireEvent.mouseDown(idClickTarget, { clientX: 0, clientY: 0 });
    fireEvent.mouseUp(idClickTarget, { clientX: 0, clientY: 0 });

    expect(
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("gridcell")[0].textContent),
    ).toEqual(["8", "7", "6", "5", "4", "3", "2", "1"]);

    const nameHeader = screen.getByRole("columnheader", { name: "name" });
    const clickTarget = within(nameHeader).getByTestId("cell-data");

    fireEvent.mouseDown(clickTarget, { clientX: 0, clientY: 0 });
    fireEvent.mouseUp(clickTarget, { clientX: 0, clientY: 0 });

    const rows = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole("gridcell")
          .map((cell) => cell.textContent),
      );

    expect(rows).toEqual([
      ["7", "Delta"],
      ["3", "Charlie"],
      ["5", "Bob"],
      ["1", "Alice"],
      ["2", ""],
      ["4", ""],
      ["6", ""],
      ["8", ""],
    ]);
  });
});

describe("query builder sort indicators", () => {
  beforeAll(() => {
    mockGetBoundingClientRect();
  });

  function setupSortedByCustomAggregation(direction: "asc" | "desc") {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [
            {
              name: "CE",
              value: {
                type: "operator",
                operator: "count-where",
                args: [
                  {
                    type: "operator",
                    operator: ">",
                    args: [
                      { type: "column", name: "TOTAL" },
                      { type: "literal", value: 0 },
                    ],
                  },
                ],
              },
            },
          ],
          breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
          orderBys: [{ type: "column", name: "CE", direction }],
        },
      ],
    });
    const series = [
      createMockSingleSeries(
        { display: "table", dataset_query: Lib.toJsQuery(query) },
        {
          data: {
            cols: [
              createMockColumn({
                id: ORDERS.CREATED_AT,
                name: "CREATED_AT",
                display_name: "Created At: Month",
                base_type: "type/DateTime",
                effective_type: "type/DateTime",
                source: "breakout",
                unit: "month",
                field_ref: [
                  "field",
                  ORDERS.CREATED_AT,
                  { "base-type": "type/DateTime", "temporal-unit": "month" },
                ],
              }),
              createMockNumericColumn({
                name: "CE",
                display_name: "CE",
                source: "aggregation",
                field_ref: ["aggregation", 0],
              }),
            ],
            rows: [
              ["2025-01-01T00:00:00Z", 584],
              ["2025-02-01T00:00:00Z", 1],
            ],
          },
        },
      ),
    ];

    renderWithProviders(
      <Visualization rawSeries={series} width={600} height={400} />,
      {
        storeInitialState: createMockState({
          entities: createMockEntitiesState({
            databases: [createSampleDatabase()],
          }),
        }),
      },
    );
  }

  it.each([
    { direction: "asc" as const, icon: "chevronup", otherIcon: "chevrondown" },
    { direction: "desc" as const, icon: "chevrondown", otherIcon: "chevronup" },
  ])(
    "shows the $direction sort direction on the header of a custom aggregation (metabase#6239)",
    ({ direction, icon, otherIcon }) => {
      setupSortedByCustomAggregation(direction);

      const ceHeader = screen.getByRole("columnheader", { name: /CE/ });
      expect(
        within(ceHeader).getByLabelText(`${icon} icon`),
      ).toBeInTheDocument();
      expect(
        within(ceHeader).queryByLabelText(`${otherIcon} icon`),
      ).not.toBeInTheDocument();

      const createdAtHeader = screen.getByRole("columnheader", {
        name: /Created At: Month/,
      });
      expect(
        within(createdAtHeader).queryByLabelText(/^chevron(up|down) icon$/),
      ).not.toBeInTheDocument();
    },
  );
});

describe("table.striped", () => {
  beforeAll(() => {
    mockGetBoundingClientRect();
  });

  it("should be a display toggle disabled by default", () => {
    const setting = Table.settings["table.striped"];

    expect(setting).toBeDefined();
    expect(setting.widget).toBe("toggle");
    expect(setting.inline).toBe(true);
    expect(setting.getDefault?.()).toBe(false);
  });

  function setupStripedTable() {
    const series = [
      createMockSingleSeries(
        { display: "table" },
        {
          data: {
            cols: [createMockNumericColumn({ display_name: "id", name: "id" })],
            rows: [[1], [2], [3], [4]],
          },
        },
      ),
    ];

    series[0].card.visualization_settings = {
      ...series[0].card.visualization_settings,
      "table.striped": true,
    };

    renderWithProviders(
      <Visualization rawSeries={series} isDashboard width={600} height={400} />,
    );
  }

  function getStripedRows() {
    return screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => [
        within(row).getAllByRole("gridcell")[0].textContent,
        row.getAttribute("data-row-striped") === "true",
      ]);
  }

  it("stripes every other rendered row", () => {
    setupStripedTable();

    expect(getStripedRows()).toEqual([
      ["1", false],
      ["2", true],
      ["3", false],
      ["4", true],
    ]);
  });

  it("keeps stripes on alternating rendered rows after client-side sorting (#71960)", () => {
    setupStripedTable();

    const idHeader = screen.getByRole("columnheader", { name: "id" });
    const clickTarget = within(idHeader).getByTestId("cell-data");

    fireEvent.mouseDown(clickTarget, { clientX: 0, clientY: 0 });
    fireEvent.mouseUp(clickTarget, { clientX: 0, clientY: 0 });

    // Rows are now in descending order; the stripes must still alternate by
    // display position rather than by position in the original dataset.
    expect(getStripedRows()).toEqual([
      ["4", false],
      ["3", true],
      ["2", false],
      ["1", true],
    ]);
  });
});

describe("currency column settings", () => {
  beforeAll(() => {
    mockGetBoundingClientRect();
  });

  it("formats a column keyed by its legacy field ref with the currency code", () => {
    const totalColumn = createMockNumericColumn({
      id: ORDERS.TOTAL,
      name: "TOTAL",
      display_name: "Total",
      field_ref: ["field", ORDERS.TOTAL, null],
    });
    const subtotalColumn = createMockNumericColumn({
      id: ORDERS.SUBTOTAL,
      name: "SUBTOTAL",
      display_name: "Subtotal",
      field_ref: ["field", ORDERS.SUBTOTAL, null],
    });
    const series = [
      createMockSingleSeries(
        {
          display: "table",
          visualization_settings: {
            column_settings: {
              [`["ref",["field",${ORDERS.TOTAL},null]]`]: {
                currency: "USD",
                currency_in_header: false,
                currency_style: "code",
                number_style: "currency",
              },
            },
          },
        },
        {
          data: {
            cols: [subtotalColumn, totalColumn],
            rows: [
              [37.65, 39.72],
              [110.93, 117.03],
            ],
          },
        },
      ),
    ];

    renderWithProviders(
      <Visualization rawSeries={series} width={600} height={400} />,
    );

    const cellValues = screen
      .getAllByRole("gridcell")
      .map((cell) => cell.textContent)
      .filter((text) => text !== "");
    expect(cellValues).toEqual([
      "37.65",
      "USD\u00a039.72",
      "110.93",
      "USD\u00a0117.03",
    ]);
  });
});

describe("text_wrapping", () => {
  describe("line breaks in cells (#6178, #64697)", () => {
    beforeAll(() => {
      mockGetBoundingClientRect();
    });

    const wrappedColumn = createMockCategoryColumn({
      name: "wrapped",
      display_name: "wrapped",
    });
    const unwrappedColumn = createMockCategoryColumn({
      name: "unwrapped",
      display_name: "unwrapped",
    });

    it.each([
      ["\\n", "\n"],
      ["\\r\\n", "\r\n"],
      ["\\r", "\r"],
      ["\\u0085", "\u0085"],
      ["\\u2028", " "],
      ["\\u2029", " "],
    ])(
      "should render %s as a line break when wrapped and a space when not",
      (_name, lineBreak) => {
        const value = `line1${lineBreak}line2`;
        const series = [
          createMockSingleSeries(
            {
              display: "table",
              visualization_settings: {
                column_settings: {
                  [getColumnKey(wrappedColumn)]: { text_wrapping: true },
                },
              },
            },
            {
              data: {
                cols: [wrappedColumn, unwrappedColumn],
                rows: [[value, value]],
              },
            },
          ),
        ];

        renderWithProviders(
          <Visualization rawSeries={series} width={600} height={400} />,
        );

        const [_rowIdCell, wrappedCell, unwrappedCell] =
          screen.getAllByRole("gridcell");
        expect(wrappedCell).toHaveTextContent("line1\nline2", {
          normalizeWhitespace: false,
        });
        expect(unwrappedCell).toHaveTextContent("line1 line2", {
          normalizeWhitespace: false,
        });
      },
    );
  });

  describe("in columnSettings", () => {
    function assertDefined<T>(
      value: T | undefined | null,
      name: string,
    ): asserts value is T {
      if (value == null) {
        throw new Error(`${name} should be defined`);
      }
    }

    const getTextWrappingSetting = (column: DatasetColumn) => {
      const textWrappingSetting = Table.columnSettings(column)["text_wrapping"];
      assertDefined(textWrappingSetting, "text_wrapping setting");
      return textWrappingSetting;
    };

    const getGetHidden = (column: DatasetColumn) => {
      const textWrappingSetting = getTextWrappingSetting(column);
      assertDefined(textWrappingSetting.getHidden, "text_wrapping getHidden");
      return textWrappingSetting.getHidden;
    };

    const getIsValid = (column: DatasetColumn) => {
      const textWrappingSetting = getTextWrappingSetting(column);
      assertDefined(textWrappingSetting.isValid, "text_wrapping isValid");
      return textWrappingSetting.isValid;
    };

    it("should be available for string columns", () => {
      const stringColumn = createMockCategoryColumn();
      const textWrappingSetting = getTextWrappingSetting(stringColumn);

      expect(textWrappingSetting).toBeDefined();
    });

    it("should not be available for non-string columns", () => {
      const numberColumn = createMockNumericColumn();
      const settings = Table.columnSettings(numberColumn);

      expect(settings["text_wrapping"]).toBeUndefined();
    });

    it("should be hidden when view_as is image", () => {
      const stringColumn = createMockCategoryColumn();
      const getHidden = getGetHidden(stringColumn);

      const isHidden = getHidden(stringColumn, {
        view_as: "image",
      });

      expect(isHidden).toBe(true);
    });

    it("should be not valid when view_as is image", () => {
      const stringColumn = createMockCategoryColumn();
      const isValid = getIsValid(stringColumn);

      const valueIsValid = isValid(stringColumn, {
        view_as: "image",
      });

      expect(valueIsValid).toBe(false);
    });

    it("should be visible when view_as is null", () => {
      const stringColumn = createMockCategoryColumn();
      const getHidden = getGetHidden(stringColumn);

      const isHidden = getHidden(stringColumn, {
        view_as: null,
      });

      expect(isHidden).toBe(false);
    });

    it("should be visible when view_as is auto", () => {
      const stringColumn = createMockCategoryColumn();
      const getHidden = getGetHidden(stringColumn);

      const isHidden = getHidden(stringColumn, {
        view_as: "auto",
      });

      expect(isHidden).toBe(false);
    });

    it("should be visible when view_as is link", () => {
      const stringColumn = createMockCategoryColumn();
      const getHidden = getGetHidden(stringColumn);

      const isHidden = getHidden(stringColumn, {
        view_as: "link",
      });

      expect(isHidden).toBe(false);
    });

    it("should be valid when view_as is link", () => {
      const stringColumn = createMockCategoryColumn();
      const isValid = getIsValid(stringColumn);

      const valueIsValid = isValid(stringColumn, {
        view_as: "link",
      });

      expect(valueIsValid).toBe(true);
    });

    it("should default to false", () => {
      const stringColumn = createMockCategoryColumn();
      const textWrappingSetting = getTextWrappingSetting(stringColumn);

      expect(textWrappingSetting.getDefault?.(stringColumn, {})).toBe(false);
    });
  });
});

describe("orders table grid", () => {
  // wide and tall enough for the data grid to render every column, and the
  // first rows of a long table
  const GRID_RECT = { width: 4000, height: 800 };

  // two rows from the sample database's ORDERS table, as the backend sends them
  const ORDER_1: RowValues = [
    1,
    1,
    14,
    37.65,
    2.07,
    39.718145389078366,
    null,
    "2028-02-11T21:40:27.892-08:00",
    2,
  ];
  const ORDER_2: RowValues = [
    2,
    1,
    123,
    110.93,
    6.1,
    117.03,
    6.42,
    "2027-05-15T08:04:04.58-07:00",
    3,
  ];

  const getOrderRows = (count: number): RowValues[] =>
    Array.from({ length: count }, (_, index) => [
      index + 1,
      ...ORDER_1.slice(1),
    ]);

  type GridSetupOpts = {
    rows: RowValues[];
    visualization_settings?: VisualizationSettings;
    isDashboard?: boolean;
    height?: number;
  };

  const getOrdersSeries = ({
    rows,
    visualization_settings = {},
  }: Pick<GridSetupOpts, "rows" | "visualization_settings">): Series => [
    createMockSingleSeries(
      { display: "table", visualization_settings },
      {
        row_count: rows.length,
        data: {
          cols: createOrdersTableDatasetColumns(),
          rows,
          // the backend sets it when a dashcard query hits the row limit
          rows_truncated: rows.length,
        },
      },
    ),
  ];

  const setupGrid = ({
    rows,
    visualization_settings,
    isDashboard = false,
    height = GRID_RECT.height,
  }: GridSetupOpts) => {
    const series = getOrdersSeries({ rows, visualization_settings });
    const getVisualization = (height: number) => (
      <div>
        <h1>Outside the table</h1>
        <Visualization
          rawSeries={series}
          isDashboard={isDashboard}
          width={GRID_RECT.width}
          height={height}
        />
      </div>
    );
    const { rerender } = renderWithProviders(getVisualization(height));
    return {
      setHeight: (height: number) => rerender(getVisualization(height)),
    };
  };

  const getBody = () => screen.getByTestId("table-body");

  const getVisibleIds = () =>
    within(getBody())
      .getAllByRole("gridcell")
      .filter((cell) => cell.dataset.columnId === "ID")
      .map((cell) => cell.textContent);

  // the parts of a row, as the data grid renders its pinned and scrolled
  // sections separately
  const getRowParts = (index: number) =>
    within(getBody())
      .queryAllByRole("row")
      .filter((row) => row.dataset.datasetIndex === String(index));

  const getRowCells = (index: number) =>
    getRowParts(index).flatMap((row) => within(row).queryAllByRole("gridcell"));

  // the name of a sorted header also has the sort icon
  const getHeader = (name: string) =>
    screen.getByRole("columnheader", { name: new RegExp(`^${name}( |$)`) });

  const clickHeader = (name: string) => {
    const header = getHeader(name);
    const clickTarget = within(header).getByTestId("cell-data");
    fireEvent.mouseDown(clickTarget, { clientX: 0, clientY: 0 });
    fireEvent.mouseUp(clickTarget, { clientX: 0, clientY: 0 });
  };

  beforeEach(() => {
    mockGetBoundingClientRect(GRID_RECT);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("cell selection", () => {
    let writeText: jest.Mock;
    let originalClipboard: Clipboard;

    beforeEach(() => {
      originalClipboard = navigator.clipboard;
      writeText = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText },
      });
    });

    afterEach(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: originalClipboard,
      });
    });

    // the cells of the second row, other than its primary key
    const getSecondRowCells = () => {
      return getRowParts(1)
        .flatMap((row) => within(row).queryAllByRole("gridcell"))
        .filter(
          (cell) =>
            cell.hasAttribute("data-selectable-cell") &&
            cell.dataset.columnId !== "ID",
        );
    };

    const getSelectedCellTexts = () =>
      within(getBody())
        .getAllByRole("gridcell")
        .filter((cell) => cell.getAttribute("aria-selected") === "true")
        .map((cell) => cell.textContent);

    const click = (
      cell: HTMLElement,
      modifiers: { metaKey?: boolean; shiftKey?: boolean } = {},
    ) => {
      fireEvent.mouseDown(cell, modifiers);
      fireEvent.mouseUp(cell, modifiers);
      fireEvent.click(cell, modifiers);
    };

    it("should select cells by click, drag, cmd+click and shift+click, copy them, and clear the selection", async () => {
      setupGrid({ rows: [ORDER_2, ORDER_1] });
      const cells = getSecondRowCells();
      expect(cells.map((cell) => cell.textContent)).toEqual([
        "1",
        "14",
        "37.65",
        "2.07",
        "39.72",
        "",
        "February 11, 2028, 9:40 PM",
        "2",
      ]);
      expect(getSelectedCellTexts()).toEqual([]);

      click(cells[1]);
      expect(cells[1]).toHaveAttribute("aria-selected", "true");
      expect(getSelectedCellTexts()).toEqual(["14"]);

      // drag from the first cell to the fourth one
      fireEvent.mouseDown(cells[0], { buttons: 1 });
      fireEvent.mouseOver(cells[3], { buttons: 1 });
      fireEvent.mouseUp(cells[3]);
      expect(getSelectedCellTexts()).toEqual(["1", "14", "37.65", "2.07"]);

      click(cells[5], { metaKey: true });
      expect(getSelectedCellTexts()).toEqual(["1", "14", "37.65", "2.07", ""]);

      click(cells[4]);
      click(cells[6], { shiftKey: true });
      expect(getSelectedCellTexts()).toEqual([
        "39.72",
        "",
        "February 11, 2028, 9:40 PM",
      ]);

      fireEvent.keyDown(window, { key: "c", metaKey: true });
      expect(writeText).toHaveBeenLastCalledWith(
        "Total\tDiscount ($)\tCreated At\n39.72\t\tFebruary 11, 2028, 9:40 PM",
      );

      fireEvent.keyDown(window, { key: "c", metaKey: true, shiftKey: true });
      expect(writeText).toHaveBeenLastCalledWith(
        "Total\tDiscount ($)\tCreated At\n" +
          "39.718145389078366\tnull\t2028-02-11T21:40:27.892-08:00",
      );
      expect(writeText).toHaveBeenCalledTimes(2);

      fireEvent.keyDown(window, { key: "Escape" });
      expect(getSelectedCellTexts()).toEqual([]);

      click(cells[2]);
      expect(getSelectedCellTexts()).toEqual(["37.65"]);
      await userEvent.click(screen.getByText("Outside the table"));
      expect(getSelectedCellTexts()).toEqual([]);
    });
  });

  it("should keep the DOM nodes of the rows that stay visible during scrolling", () => {
    setupGrid({ rows: getOrderRows(100) });
    const targetIndex = 15;

    const targetRowParts = getRowParts(targetIndex);
    expect(targetRowParts.length).toBeGreaterThan(0);
    expect(getRowParts(0).length).toBeGreaterThan(0);

    const scrollContainer = screen.getByTestId("table-scroll-container");
    scrollContainer.scrollTop = 36 * (targetIndex - 1);
    fireEvent.scroll(scrollContainer);

    expect(getRowParts(0)).toEqual([]);
    const targetRowPartsAfterScroll = getRowParts(targetIndex);
    expect(targetRowPartsAfterScroll).toHaveLength(targetRowParts.length);
    targetRowPartsAfterScroll.forEach((row, index) => {
      expect(row).toBe(targetRowParts[index]);
    });
  });

  describe("in a dashboard", () => {
    it("should show the row count without pagination", () => {
      setupGrid({ rows: getOrderRows(2000), isDashboard: true });

      expect(screen.queryByText(/^Rows \d+-\d+/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Next page")).not.toBeInTheDocument();
      expect(screen.getByText("Showing first 2,000 rows")).toBeInTheDocument();
    });

    it("should paginate the rows, with a page size that follows the card height", () => {
      const { setHeight } = setupGrid({
        rows: getOrderRows(2000),
        visualization_settings: { "table.pagination": true },
        isDashboard: true,
        height: 400,
      });

      expect(screen.getByText("Rows 1-9 of first 2,000")).toBeInTheDocument();
      expect(
        screen.queryByText("Showing first 2,000 rows"),
      ).not.toBeInTheDocument();
      expect(getVisibleIds()).toContain("6");
      expect(getVisibleIds()).not.toContain("12");

      fireEvent.click(screen.getByLabelText("Next page"));
      expect(screen.getByText("Rows 10-18 of first 2,000")).toBeInTheDocument();
      expect(getVisibleIds()).toContain("12");
      expect(getVisibleIds()).not.toContain("6");

      fireEvent.click(screen.getByLabelText("Previous page"));
      expect(screen.getByText("Rows 1-9 of first 2,000")).toBeInTheDocument();
      expect(getVisibleIds()).toContain("6");
      expect(getVisibleIds()).not.toContain("12");

      // a taller card shows more rows on a page
      setHeight(800);
      expect(screen.getByText(/^Rows 1-\d+ of first 2,000$/)).toHaveTextContent(
        "Rows 1-20 of first 2,000",
      );
      expect(getVisibleIds()).toContain("12");
    });

    const getPinnedRowId = () => {
      const pinnedQuadrant = screen.getByTestId("pinned-center-quadrant");
      return within(pinnedQuadrant)
        .getAllByRole("gridcell")
        .filter((cell) => cell.dataset.columnId === "ID")
        .map((cell) => within(cell).getByTestId("cell-data").textContent);
    };

    const PINNED_ROW_SETTINGS = {
      "table.freeze_rows": true,
      "table.freeze_rows_count": 1,
    };

    it("should keep the pinned row on every page", () => {
      setupGrid({
        rows: getOrderRows(2000),
        visualization_settings: {
          ...PINNED_ROW_SETTINGS,
          "table.pagination": true,
        },
        isDashboard: true,
        height: 400,
      });

      expect(getPinnedRowId()).toEqual(["1"]);
      expect(screen.getByText("Rows 1-9 of first 2,000")).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText("Next page"));
      expect(screen.getByText("Rows 10-18 of first 2,000")).toBeInTheDocument();
      expect(getPinnedRowId()).toEqual(["1"]);
    });

    it("should show the first row of the sorted rows as the pinned row", () => {
      setupGrid({
        rows: getOrderRows(2000),
        visualization_settings: PINNED_ROW_SETTINGS,
        isDashboard: true,
      });

      expect(getPinnedRowId()).toEqual(["1"]);

      clickHeader("ID");
      expect(getPinnedRowId()).toEqual(["2000"]);

      clickHeader("ID");
      expect(getPinnedRowId()).toEqual(["1"]);
    });

    it("should keep the row index in display order after client-side sorting", () => {
      setupGrid({
        rows: getOrderRows(5),
        visualization_settings: { "table.row_index": true },
        isDashboard: true,
      });
      // the first row on screen, whichever row of the data it shows
      const getFirstRowIndexAndId = () => {
        const [firstRow] = within(getBody()).getAllByRole("row");
        const cells = getRowCells(Number(firstRow.dataset.datasetIndex));
        return [
          cells
            .map((cell) => within(cell).queryByTestId("row-id-cell"))
            .find(Boolean)?.textContent,
          cells.find((cell) => cell.dataset.columnId === "ID")?.textContent,
        ];
      };

      expect(getFirstRowIndexAndId()).toEqual(["1", "1"]);

      clickHeader("ID");
      expect(
        within(getHeader("ID")).getByLabelText("chevrondown icon"),
      ).toBeInTheDocument();
      expect(getFirstRowIndexAndId()).toEqual(["1", "5"]);
    });
  });
});
