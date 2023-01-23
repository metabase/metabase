import React from "react";
import { render, screen } from "@testing-library/react";
import _ from "underscore";
import type { VisualizationSettings } from "metabase-types/api";
import type { Column } from "metabase-types/types/Dataset";

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
] as Column[];

const rows = [
  ["foo1", "bar1", "baz1", 0, 111, 222],
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

function setup(options?: any) {
  render(<PivotTableWrapper {...options} />);
}

function PivotTableWrapper(props?: any) {
  const [vizSettings, setVizSettings] = React.useState(
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

  it("should render pivot table wrapper", async () => {
    setup();
    expect(await screen.findByTestId("pivot-table")).toBeInTheDocument();
  });

  it("should render column names", () => {
    setup();

    // all column names except 3, the pivot grouping, should be in the document
    columnIndexes.forEach(colIndex => {
      expect(screen.getByText(cols[colIndex].display_name)).toBeInTheDocument();
    });
  });

  it("should render column values", () => {
    setup();

    rows.forEach(rowData => {
      columnIndexes.forEach(colIndex => {
        expect(
          screen.getByText(rowData[colIndex].toString()),
        ).toBeInTheDocument();
      });
    });
  });

  it("should not render hidden column values", () => {
    const hiddenSettings = {
      ...settings,
      "pivot_table.collapsed_rows": {
        rows: [cols[0].field_ref, cols[1].field_ref, cols[2].field_ref],
        value: ["2"],
      },
    } as unknown as VisualizationSettings;

    setup({ initialSettings: hiddenSettings });

    rows.forEach(rowData => {
      expect(screen.getByText(rowData[0].toString())).toBeInTheDocument();

      [1, 2, 4, 5].forEach(colIndex => {
        expect(
          screen.queryByText(rowData[colIndex].toString()),
        ).not.toBeInTheDocument();
      });
    });
  });
});
