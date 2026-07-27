import { render, screen } from "__support__/ui";
import type { Partition } from "metabase/visualizations/visualizations/PivotTable/partitions";
import { createMockColumn } from "metabase-types/api/mocks";

import { ChartSettingFieldsPartition } from "./ChartSettingFieldsPartition";

const partitions: Partition[] = [
  { name: "rows", title: "Rows", columnFilter: (x) => Boolean(x) },
];

describe("ChartSettingFieldsPartition", () => {
  it("should render empty state when value is undefined", () => {
    render(
      <ChartSettingFieldsPartition
        partitions={partitions}
        columns={[createMockColumn()]}
        getColumnTitle={(column) => column.display_name}
        onChange={jest.fn()}
        onShowWidget={jest.fn()}
      />,
    );
    expect(screen.getByText("Drag fields here")).toBeInTheDocument();
  });

  it("should render column when value is provided", () => {
    const fieldName = "my column";
    render(
      <ChartSettingFieldsPartition
        partitions={partitions}
        columns={[
          createMockColumn({
            name: fieldName,
            display_name: fieldName,
          }),
        ]}
        getColumnTitle={(column) => column.display_name}
        value={{ rows: [fieldName], columns: [], values: [] }}
        onChange={jest.fn()}
        onShowWidget={jest.fn()}
      />,
    );
    expect(screen.queryByText("Drag fields here")).not.toBeInTheDocument();
    expect(screen.getByText(fieldName)).toBeInTheDocument();
  });
});
