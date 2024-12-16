import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "__support__/ui";
import { createMockVisualizationSettings } from "metabase-types/api/mocks";

import {
  PIVOT_TABLE_MOCK_DATA,
  PivotTableTestWrapper,
} from "./pivot-table-test-mocks";

const { rows, cols, settings } = PIVOT_TABLE_MOCK_DATA;

// 3 isn't a real column, it's a pivot-grouping
const columnIndexes = [0, 1, 2, 4, 5];

const TEST_CASES = [
  { name: "dashboard", isDashboard: true },
  { name: "query builder", isDashboard: false },
];

function setup(options?: any) {
  renderWithProviders(<PivotTableTestWrapper {...options} />);
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
        const hiddenSettings = createMockVisualizationSettings({
          ...settings,
          "pivot_table.collapsed_rows": {
            rows: [cols[0].name, cols[1].name, cols[2].name],
            value: ["2"],
          },
        });

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
        const hiddenSettings = createMockVisualizationSettings({
          ...settings,
          "pivot_table.collapsed_rows": {
            rows: [cols[0].name, cols[1].name, cols[2].name],
            value: ["2"],
          },
        });

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
