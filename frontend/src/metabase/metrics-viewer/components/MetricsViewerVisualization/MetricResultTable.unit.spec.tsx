import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { MetricResultTable } from "./MetricResultTable";

it("renders formula results without requiring an MBQL aggregation reference", () => {
  renderWithProviders(
    <MetricResultTable
      name="Product count * 2"
      data={createMockDatasetData({
        cols: [
          createMockColumn({
            name: "category",
            display_name: "Category",
            base_type: "type/Text",
          }),
          createMockColumn({
            name: "expression",
            display_name: "Product count * 2",
            base_type: "type/Integer",
            field_ref: ["aggregation", 0],
          }),
        ],
        rows: [["Widget", 108]],
      })}
    />,
  );
  expect(
    screen.getByRole("table", { name: "Product count * 2" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "Widget" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "108" })).toBeInTheDocument();
});
