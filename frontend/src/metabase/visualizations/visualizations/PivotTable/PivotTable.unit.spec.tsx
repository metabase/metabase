import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { thaw } from "icepick";
import type { ComponentProps } from "react";
import { useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders } from "__support__/ui";
import { QuestionChartSettings } from "metabase/visualizations/components/ChartSettings";
import registerVisualizations from "metabase/visualizations/register";
import Question from "metabase-lib/v1/Question";
import type { VisualizationSettings } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  SAMPLE_DB_ID,
  createOrdersCreatedAtDatasetColumn,
  createProductsCategoryDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  PIVOT_TABLE_MOCK_DATA,
  PivotTableTestWrapper,
} from "./pivot-table-test-mocks";

registerVisualizations();

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const { rows, cols, settings } = PIVOT_TABLE_MOCK_DATA;

// 3 isn't a real column, it's a pivot-grouping
const columnIndexes = [0, 1, 2, 4, 5];

const TEST_CASES = [
  { name: "dashboard", isDashboard: true },
  { name: "query builder", isDashboard: false },
];

function setupPivotTable(
  options?: ComponentProps<typeof PivotTableTestWrapper>,
) {
  renderWithProviders(<PivotTableTestWrapper {...options} />);
}

function setupPivotSettings() {
  const Container = () => {
    const [question, setQuestion] = useState(
      new Question(
        createMockCard({
          dataset_query: {
            type: "query",
            query: {
              "source-table": ORDERS_ID,
              aggregation: [["count"]],
              breakout: [
                ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
                [
                  "field",
                  PRODUCTS.CREATED_AT,
                  { "source-field": ORDERS.PRODUCT_ID },
                ],
              ],
            },
            database: SAMPLE_DB_ID,
          },
          display: "pivot",
          visualization_settings: {},
        }),
        metadata,
      ),
    );

    const onChange = (update: VisualizationSettings) => {
      setQuestion((q) => {
        const newQuestion = q.updateSettings(update);
        return new Question(thaw(newQuestion.card()), metadata);
      });
    };

    return (
      <QuestionChartSettings
        onChange={onChange}
        series={[
          {
            card: question.card(),
            data: createMockDatasetData({
              rows: [],
              cols: [
                createOrdersCreatedAtDatasetColumn({ source: "breakout" }),
                createProductsCategoryDatasetColumn({ source: "breakout" }),
                createMockColumn({
                  name: "count",
                  display_name: "Count",
                  field_ref: ["aggregation", 0],
                  source: "aggregation",
                  base_type: "type/Integer",
                  effective_type: "type/Integer",
                }),
                createMockColumn({
                  name: "pivot-grouping",
                  display_name: "pivot-grouping",
                  field_ref: ["expression", "pivot-grouping"],
                  source: "breakout",
                  base_type: "type/Integer",
                  effective_type: "type/Integer",
                }),
              ],
            }),
          },
        ]}
        initial={{ section: "Data" }}
        question={question}
      />
    );
  };

  renderWithProviders(<Container />);
}

describe("Visualizations > PivotTable > PivotTable", () => {
  // we need to mock offsetHeight and offsetWidth to make react-virtualized work with react-dom
  // https://github.com/bvaughn/react-virtualized/issues/493#issuecomment-447014986
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetHeight",
  ) as number;
  const originalOffsetWidth = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetWidth",
  ) as number;

  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      value: 500,
    });
  });

  afterAll(() => {
    Object.defineProperty(
      HTMLElement.prototype,
      "offsetHeight",
      originalOffsetHeight,
    );
    Object.defineProperty(
      HTMLElement.prototype,
      "offsetWidth",
      originalOffsetWidth,
    );
  });

  TEST_CASES.forEach((testCase) => {
    describe(` > ${testCase.name}`, () => {
      it("should render pivot table wrapper", async () => {
        setupPivotTable({ isDashboard: testCase.isDashboard });
        expect(await screen.findByTestId("pivot-table")).toBeInTheDocument();
      });

      it("should render column names", () => {
        setupPivotTable({ isDashboard: testCase.isDashboard });

        // all column names except 3, the pivot grouping, should be in the document
        columnIndexes.forEach((colIndex) => {
          expect(
            screen.getByText(cols[colIndex].display_name),
          ).toBeInTheDocument();
        });
      });

      it("should render column values", () => {
        setupPivotTable({ isDashboard: testCase.isDashboard });

        rows.forEach((rowData) => {
          columnIndexes.forEach((colIndex) => {
            expect(screen.getByTestId("pivot-table")).toHaveTextContent(
              rowData[colIndex].toString(),
            );
          });
        });
      });

      it("should collapse columns", () => {
        const hiddenSettings = createMockVisualizationSettings({
          ...settings,
          "pivot_table.collapsed_rows": {
            rows: [cols[0].name, cols[1].name, cols[2].name],
            value: ["2"],
          },
        });

        setupPivotTable({
          initialSettings: hiddenSettings,
          isDashboard: testCase.isDashboard,
        });

        const COLLAPSED_COLUMN_INDEX = 1;

        rows.forEach((row) => {
          const totalsElement = screen.getByText(
            `Totals for ${row[COLLAPSED_COLUMN_INDEX]}`,
          );
          expect(totalsElement).toBeInTheDocument();

          const totalsContainer = screen.getByTestId(
            `${row[COLLAPSED_COLUMN_INDEX]}-toggle-button`,
          );

          expect(
            within(totalsContainer).getByRole("img", {
              name: /add/i,
            }),
          ).toBeInTheDocument();
        });
      });

      it("expanding collapsed columns", async () => {
        const hiddenSettings = createMockVisualizationSettings({
          ...settings,
          "pivot_table.collapsed_rows": {
            rows: [cols[0].name, cols[1].name, cols[2].name],
            value: ["2"],
          },
        });

        setupPivotTable({
          initialSettings: hiddenSettings,
          isDashboard: testCase.isDashboard,
        });

        const COLLAPSED_COLUMN_INDEX = 1;

        const LAST_ROW = rows[3];

        // Find and click the toggle button to expand the last row
        // as it's the easiest to make assertions on
        const toggleButton = screen.getByTestId(
          `${LAST_ROW[COLLAPSED_COLUMN_INDEX]}-toggle-button`,
        );

        expect(
          within(toggleButton).getByRole("img", { name: /add/i }),
        ).toBeInTheDocument();

        await userEvent.click(toggleButton);

        //Ensure that collapsed data is now visible
        columnIndexes.forEach((columnIndex) => {
          expect(
            screen.getByText(LAST_ROW[columnIndex].toString()),
          ).toBeInTheDocument();
        });
      });
    });
  });
});

describe("Visualizations > PivotTable > Chart Settings", () => {
  it("should allow you to update a column name", async () => {
    setupPivotSettings();
    await userEvent.click(
      await screen.findByTestId("Category-settings-button"),
    );
    await userEvent.type(
      await screen.findByDisplayValue("Category"),
      " Updated",
    );
    await userEvent.click(await screen.findByText("Count"));
    expect(await screen.findByText("Category Updated")).toBeInTheDocument();
  });
});
