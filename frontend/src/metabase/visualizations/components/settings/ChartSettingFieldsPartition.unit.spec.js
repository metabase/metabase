import { render, screen } from "@testing-library/react";

import { createMockColumn } from "metabase-types/api/mocks";

import ChartSettingFieldsPartition from "./ChartSettingFieldsPartition";

describe("ChartSettingFieldsPartition", () => {
  it("should render empty state when value is undefined", () => {
    render(
      <ChartSettingFieldsPartition
        partitions={[
          { name: "rows", title: "Rows", columnFilter: x => Boolean(x) },
        ]}
        columns={[createMockColumn()]}
      />,
    );
    expect(screen.getByText("Drag fields here")).toBeInTheDocument();
  });

  it("should render column when value is provided", () => {
    const fieldRef = ["field", 14];
    const fieldName = "my column";
    render(
      <ChartSettingFieldsPartition
        partitions={[
          { name: "rows", title: "Rows", columnFilter: x => Boolean(x) },
        ]}
        columns={[
          createMockColumn({ field_ref: fieldRef, display_name: fieldName }),
        ]}
        getColumnTitle={column => column.display_name}
        value={{ rows: [fieldRef] }}
      />,
    );
    expect(screen.queryByText("Drag fields here")).not.toBeInTheDocument();
    expect(screen.getByText(fieldName)).toBeInTheDocument();
  });
});
