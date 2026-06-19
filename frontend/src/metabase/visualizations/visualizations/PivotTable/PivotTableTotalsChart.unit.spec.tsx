import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";
import type { DatasetColumn, VisualizationSettings } from "metabase-types/api";

import { PivotTableTestWrapper } from "./pivot-table-test-mocks";

registerVisualizations();

// Native pivot schema: no pivot-grouping column, a count column (new_user) and
// a percent rate column (d0). This is what enables the totals chart toggle.
const nativeCols = [
  {
    name: "cohort_date",
    display_name: "cohort_date",
    source: "native",
    base_type: "type/Date",
    field_ref: ["field", "cohort_date", { "base-type": "type/Date" }],
  },
  {
    name: "country",
    display_name: "country",
    source: "native",
    base_type: "type/Text",
    field_ref: ["field", "country", { "base-type": "type/Text" }],
  },
  {
    name: "os_family",
    display_name: "os_family",
    source: "native",
    base_type: "type/Text",
    field_ref: ["field", "os_family", { "base-type": "type/Text" }],
  },
  {
    name: "new_user",
    display_name: "new_user",
    source: "native",
    base_type: "type/Integer",
    field_ref: ["field", "new_user", { "base-type": "type/Integer" }],
  },
  {
    name: "d0",
    display_name: "d0",
    source: "native",
    base_type: "type/Float",
    field_ref: ["field", "d0", { "base-type": "type/Float" }],
  },
] as unknown as DatasetColumn[];

const nativeRows = [
  ["2024-01-01", "US", "iOS", 10, 0.5],
  ["2024-01-01", "ID", "Android", 1, 0],
  ["2024-01-02", "US", "iOS", 5, 0.4],
];

const basePivotSettings = {
  "pivot.show_column_totals": true,
  "pivot.show_row_totals": true,
  "pivot.condense_duplicate_totals": true,
  "pivot_table.collapsed_rows": { rows: [], value: [] },
  "pivot_table.column_split": {
    columns: [],
    rows: ["cohort_date", "country", "os_family"],
    values: ["new_user", "d0"],
  },
  "table.column_formatting": [],
  column_settings: {},
};

const nativeSettings = {
  ...basePivotSettings,
  column: (c: any) => ({
    ...basePivotSettings,
    column: c,
    column_title: c.display_name,
    number_style: c.name === "d0" ? "percent" : undefined,
  }),
} as unknown as VisualizationSettings;

function setup(settingsOverride?: Partial<VisualizationSettings>) {
  return renderWithProviders(
    <PivotTableTestWrapper
      data={{ rows: nativeRows, cols: nativeCols }}
      initialSettings={
        settingsOverride
          ? ({
              ...nativeSettings,
              ...settingsOverride,
            } as VisualizationSettings)
          : nativeSettings
      }
    />,
  );
}

describe("PivotTable totals chart toggle", () => {
  it("shows a 'View totals in chart' toggle for native percent pivots", () => {
    setup();
    expect(screen.getByTestId("pivot-totals-chart-toggle")).toHaveTextContent(
      "View totals in chart",
    );
    // Starts in table view.
    expect(screen.queryByTestId("pivot-totals-chart")).not.toBeInTheDocument();
  });

  it("hides the toggle when column totals are off (no Totals row)", () => {
    setup({ "pivot.show_column_totals": false });
    expect(
      screen.queryByTestId("pivot-totals-chart-toggle"),
    ).not.toBeInTheDocument();
  });

  it("toggles between table and chart view", async () => {
    setup();
    const toggle = screen.getByTestId("pivot-totals-chart-toggle");

    await userEvent.click(toggle);
    expect(screen.getByTestId("pivot-totals-chart")).toBeInTheDocument();
    expect(screen.getByTestId("pivot-totals-chart-toggle")).toHaveTextContent(
      "Back to pivot table",
    );

    await userEvent.click(screen.getByTestId("pivot-totals-chart-toggle"));
    expect(screen.queryByTestId("pivot-totals-chart")).not.toBeInTheDocument();
    expect(screen.getByTestId("pivot-totals-chart-toggle")).toHaveTextContent(
      "View totals in chart",
    );
  });

  it("hides the breakdown picker in chart view", async () => {
    setup();
    // Picker is visible in table view (3 row dims => breakdown choice exists).
    expect(screen.getByTestId("pivot-breakdown-picker")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("pivot-totals-chart-toggle"));
    // Hidden once we switch to chart view.
    expect(
      screen.queryByTestId("pivot-breakdown-picker"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("pivot-totals-chart-toggle"));
    // Back in table view, picker returns.
    expect(screen.getByTestId("pivot-breakdown-picker")).toBeInTheDocument();
  });

  it("shows a 'Collapse all rows' button for nested-row pivots", () => {
    setup();
    expect(screen.getByTestId("pivot-collapse-all-rows")).toHaveTextContent(
      "Collapse all rows",
    );
  });

  it("collapses inner rows when 'Collapse all rows' is clicked", async () => {
    setup();
    // Inner-row values are visible before collapsing.
    expect(screen.getByText("ID")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("pivot-collapse-all-rows"));

    // After collapsing every level, the inner breakdown cells are hidden.
    await waitFor(() => {
      expect(screen.queryByText("ID")).not.toBeInTheDocument();
    });
  });

  it("hides the 'Collapse all rows' button once everything is collapsed", async () => {
    setup();
    await userEvent.click(screen.getByTestId("pivot-collapse-all-rows"));

    // Nothing left to collapse → the button disappears.
    await waitFor(() => {
      expect(
        screen.queryByTestId("pivot-collapse-all-rows"),
      ).not.toBeInTheDocument();
    });
  });

  it("hides the 'Collapse all rows' button when starting fully collapsed", () => {
    // All collapsible levels (1 and 2 for 3 row dims) already collapsed.
    setup({
      "pivot_table.collapsed_rows": {
        rows: ["cohort_date", "country", "os_family"],
        value: ["1", "2"],
      },
    } as unknown as Partial<VisualizationSettings>);

    expect(
      screen.queryByTestId("pivot-collapse-all-rows"),
    ).not.toBeInTheDocument();
  });
});
