import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import _ from "underscore";

import type { DatasetColumn, VisualizationSettings } from "metabase-types/api";

import { PivotTable } from "./PivotTable";

const cols = [
  {
    source: "breakout",
    field_ref: ["field", 123, null],
    display_name: "field-123",
    name: "field-123",
  },
  {
    source: "breakout",
    field_ref: ["field", 456, null],
    display_name: "field-456",
    name: "field-456",
  },
  {
    source: "breakout",
    field_ref: ["field", 789, null],
    display_name: "field-789",
    name: "field-789",
  },
  {
    source: "breakout",
    field_ref: ["expression", "pivot-grouping"],
    name: "pivot-grouping",
    display_name: "pivot-grouping",
  },
  {
    source: "aggregation",
    field_ref: ["aggregation", 1],
    display_name: "aggregation-1",
  },
  {
    source: "aggregation",
    field_ref: ["aggregation", 2],
    display_name: "aggregation-2",
  },
] as DatasetColumn[];

const rows = [
  ["foo1", "bar1", "baz1", 0, 111, 222],
  ["foo1", "bar1", "baz2", 0, 777, 888],
  ["foo2", "bar2", "baz2", 0, 333, 444],
  ["foo3", "bar3", "baz3", 0, 555, 666],
];

const pivotSettings = {
  "pivot.show_column_totals": true,
  "pivot.show_row_totals": true,
  "pivot_table.collapsed_rows": {
    rows: [cols[0].field_ref, cols[1].field_ref, cols[2].field_ref],
    value: [],
  },
  "pivot_table.column_split": {
    columns: [],
    rows: [cols[0].field_ref, cols[1].field_ref, cols[2].field_ref],
    values: [cols[4].field_ref, cols[5].field_ref],
  },
  "table.column_formatting": [],
  column_settings: {},
};

const settings = {
  ...pivotSettings,
  column: (c: any) => ({
    ...pivotSettings,
    column: c,
    column_title: c.display_name,
  }),
} as unknown as VisualizationSettings;

// 3 isn't a real column, it's a pivot-grouping
const columnIndexes = [0, 1, 2, 4, 5];

const TEST_CASES = [
  { name: "dashboard", isDashboard: true },
  { name: "query builder", isDashboard: false },
];

function setup(options?: any) {
  render(<PivotTableWrapper {...options} />);
}

function PivotTableWrapper(props?: any) {
  const [vizSettings, setVizSettings] = useState(
    props.initialSettings ?? settings,
  );
  return (
    <PivotTable
      settings={vizSettings}
      data={{ rows, cols }}
      width={600}
      onVisualizationClick={_.noop}
      onUpdateVisualizationSettings={newSettings =>
        setVizSettings({ ...vizSettings, ...newSettings })
      }
      isNightMode={false}
      isDashboard={false}
      {...props}
    />
  );
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

  TEST_CASES.forEach(testCase => {
    describe(` > ${testCase.name}`, () => {
      it("should render pivot table wrapper", async () => {
        setup({ isDashboard: testCase.isDashboard });
        expect(await screen.findByTestId("pivot-table")).toBeInTheDocument();
      });

      it("should render column names", () => {
        setup({ isDashboard: testCase.isDashboard });

        // all column names except 3, the pivot grouping, should be in the document
        columnIndexes.forEach(colIndex => {
          expect(
            screen.getByText(cols[colIndex].display_name),
          ).toBeInTheDocument();
        });
      });

      it("should render column values", () => {
        setup({ isDashboard: testCase.isDashboard });

        rows.forEach(rowData => {
          columnIndexes.forEach(colIndex => {
            expect(screen.getByTestId("pivot-table")).toHaveTextContent(
              rowData[colIndex].toString(),
            );
          });
        });
      });

      it("should collapse columns", () => {
        const hiddenSettings = {
          ...settings,
          "pivot_table.collapsed_rows": {
            rows: [cols[0].field_ref, cols[1].field_ref, cols[2].field_ref],
            value: ["2"],
          },
        } as unknown as VisualizationSettings;

        setup({
          initialSettings: hiddenSettings,
          isDashboard: testCase.isDashboard,
        });

        const COLLAPSED_COLUMN_INDEX = 1;

        rows.forEach(row => {
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
        const hiddenSettings = {
          ...settings,
          "pivot_table.collapsed_rows": {
            rows: [cols[0].field_ref, cols[1].field_ref, cols[2].field_ref],
            value: ["2"],
          },
        } as unknown as VisualizationSettings;

        setup({
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
        columnIndexes.forEach(columnIndex => {
          expect(
            screen.getByText(LAST_ROW[columnIndex].toString()),
          ).toBeInTheDocument();
        });
      });
    });
  });
});
