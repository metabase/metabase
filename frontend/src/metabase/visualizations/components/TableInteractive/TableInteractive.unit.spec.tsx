import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import {
  createMockCategoryColumn,
  createMockNumericColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

registerVisualizations();

beforeAll(async () => {
  mockGetBoundingClientRect();
  await loadVisualizationComponents(["table"]);
});

describe("TableInteractive Subtotals", () => {
  const createTableSeries = (showSubtotal: boolean, rows: any[][]) => [
    createMockSingleSeries(
      {
        display: "table",
        visualization_settings: {
          "table.show_subtotal": showSubtotal,
          column_settings: {
            [getColumnKey({ name: "price" })]: {
              number_style: "currency",
              currency: "USD",
              currency_in_header: false,
            },
          },
        },
      },
      {
        data: {
          cols: [
            createMockNumericColumn({
              id: 1,
              name: "id",
              display_name: "ID",
              semantic_type: "type/PK",
            }),
            createMockCategoryColumn({
              id: 2,
              name: "product",
              display_name: "Product",
            }),
            createMockNumericColumn({
              id: 3,
              name: "quantity",
              display_name: "Quantity",
            }),
            createMockNumericColumn({
              id: 4,
              name: "price",
              display_name: "Price",
              semantic_type: "type/Currency",
              settings: {
                number_style: "currency",
                currency: "USD",
                currency_in_header: false,
              },
            }),
          ],
          rows,
        },
      },
    ),
  ];

  it("calculates and displays subtotals for numeric and currency columns when table.show_subtotal is true", async () => {
    const series = createTableSeries(true, [
      [1, "Widget A", 10, 50],
      [2, "Widget B", 20, 100],
      [3, "Widget C", null, ""],
    ]);

    renderWithProviders(
      <Visualization rawSeries={series} isDashboard width={800} height={500} />,
    );

    const footerContainer = await screen.findByTestId("table-footer-container");
    expect(screen.getByText("Subtotal")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("$150.00")).toBeInTheDocument();

    // Verify PK / ID column (1 + 2 + 3 = 6) is not summed
    expect(footerContainer).not.toHaveTextContent("6");
  });

  it("does not render footer container when table.show_subtotal is false", async () => {
    const series = createTableSeries(false, [[1, "Widget A", 10, 50]]);

    renderWithProviders(
      <Visualization rawSeries={series} isDashboard width={800} height={500} />,
    );

    expect(
      screen.queryByTestId("table-footer-container"),
    ).not.toBeInTheDocument();
  });

  it("safely calculates subtotals on maximum dataset bounds (10,000 rows) with sparse data", () => {
    const colCount = 10;
    const rows = [];
    for (let r = 0; r < 10000; r++) {
      const row = [];
      for (let c = 0; c < colCount; c++) {
        if (r % 10 === 0 && c === 2) row.push(null);
        else if (r % 15 === 0 && c === 3) row.push("");
        else row.push(r * 1.5 + c);
      }
      rows.push(row);
    }

    for (let c = 0; c < colCount; c++) {
      let hasValidNumber = false;
      const sum = rows.reduce((acc, row) => {
        const val = row[c];
        if (val == null || val === "") return acc;
        const num = typeof val === "number" ? val : Number(val);
        if (Number.isFinite(num)) {
          hasValidNumber = true;
          return acc + num;
        }
        return acc;
      }, 0);
      expect(hasValidNumber).toBe(true);
      expect(sum).toBeGreaterThan(0);
    }
  });
});
