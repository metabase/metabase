import { renderWithProviders, screen } from "__support__/ui";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { DatasetColumn, DatasetData } from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks/dataset";

import { ListViewItem } from "./ListViewItem";

function makeSettings(overrides: Partial<ComputedVisualizationSettings> = {}) {
  const base: ComputedVisualizationSettings = {
    column: () => ({}),
  };
  return { ...base, ...overrides } as ComputedVisualizationSettings;
}

function renderItem({
  row,
  rows,
  cols,
  settings,
  titleColumn = null,
  rightColumns = [],
}: {
  row: DatasetData["rows"][number];
  rows: DatasetData["rows"];
  cols: DatasetColumn[];
  settings: ComputedVisualizationSettings;
  titleColumn?: DatasetColumn | null;
  rightColumns?: DatasetColumn[];
}) {
  renderWithProviders(
    <ListViewItem
      className="test-item"
      row={row}
      rows={rows}
      cols={cols}
      settings={settings}
      titleColumn={titleColumn}
      rightColumns={rightColumns}
      onClick={jest.fn()}
    />,
  );
}

describe("ListViewItem - ColumnValue rendering", () => {
  it("renders title using Name semantic type", () => {
    const nameCol = createMockColumn({
      name: "name",
      display_name: "Name",
      semantic_type: "type/Name",
      base_type: "type/Text",
    });
    const cols = [nameCol];
    const row = ["Alice"];
    const rows = [row];
    const settings = makeSettings();

    renderItem({ row, rows, cols, settings, titleColumn: nameCol });

    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("renders boolean as a badge with text and proper icons for true/false", () => {
    const boolColTrue = createMockColumn({
      name: "active",
      display_name: "Active",
      base_type: "type/Boolean",
    });
    const boolColFalse = createMockColumn({
      name: "inactive",
      display_name: "Inactive",
      base_type: "type/Boolean",
    });
    const cols = [boolColTrue, boolColFalse];
    const row = [true, false];
    const rows = [row];

    renderItem({
      row,
      rows,
      cols,
      settings: makeSettings(),
      rightColumns: [boolColTrue, boolColFalse],
    });

    // Text values
    expect(screen.getByText("true")).toBeInTheDocument();
    expect(screen.getByText("false")).toBeInTheDocument();

    // Icons from ColumnValue for booleans
    expect(
      screen.getByRole("img", { name: /check icon/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /close icon/i }),
    ).toBeInTheDocument();
  });

  it("renders category as a badge with label", () => {
    const catCol = createMockColumn({
      name: "status",
      display_name: "Status",
      semantic_type: "type/Category",
      base_type: "type/Text",
    });
    const cols = [catCol];
    const row = ["Open"];
    const rows = [row];

    renderItem({
      row,
      rows,
      cols,
      settings: makeSettings(),
      rightColumns: [catCol],
    });

    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("renders percentage with number and % sign", () => {
    const pctCol = createMockColumn({
      name: "conversion",
      display_name: "Conversion",
      semantic_type: "type/Percentage",
      base_type: "type/Float",
    });
    const cols = [pctCol];
    const row = [0.42];
    const rows = [row];

    const settings = makeSettings({
      column: (col) =>
        col.name === "conversion" ? { number_style: "percent" } : {},
    });

    renderItem({ row, rows, cols, settings, rightColumns: [pctCol] });

    expect(screen.getByText("0.4")).toBeInTheDocument();
    expect(screen.getAllByText("%").length).toBeGreaterThan(0);
  });

  it("renders currency with symbol and value", () => {
    const curCol = createMockColumn({
      name: "price",
      display_name: "Price",
      semantic_type: "type/Currency",
      base_type: "type/Float",
      effective_type: "type/Float",
    });
    const cols = [curCol];
    const row = [1234.56];
    const rows = [row];

    const settings = makeSettings({
      column: (col) =>
        col.name === "price"
          ? {
              number_style: "currency",
              currency: "USD",
              currency_style: "symbol",
            }
          : {},
    });

    renderItem({ row, rows, cols, settings, rightColumns: [curCol] });

    // Symbol and numeric value should be rendered separately
    expect(screen.getByText("$")).toBeInTheDocument();
    expect(screen.getByText((t) => /1,?234\.56/.test(t))).toBeInTheDocument();
  });

  it("renders image for ImageURL semantic type", () => {
    const imgCol = createMockColumn({
      name: "avatar",
      display_name: "Avatar",
      semantic_type: "type/ImageURL",
      base_type: "type/Text",
    });
    const cols = [imgCol];
    const row = ["https://example.com/a.png"];
    const rows = [row];

    renderItem({
      row,
      rows,
      cols,
      settings: makeSettings(),
      rightColumns: [imgCol],
    });

    // There should be an <img /> rendered by Mantine Image component
    const img = screen.getByRole("img");
    expect(img).toBeInTheDocument();
  });

  it("renders number with a minibar and formatted value for Quantity", () => {
    const qtyCol = createMockColumn({
      name: "score",
      display_name: "Score",
      semantic_type: "type/Quantity",
      base_type: "type/Number",
      settings: {
        show_mini_bar: true,
      },
    });
    const cols = [qtyCol];
    const row = [75];
    const rows = [row];

    const settings = makeSettings({
      column: () => ({ number_style: "decimal" }),
    });

    renderItem({ row, rows, cols, settings, rightColumns: [qtyCol] });

    // Mini bar container from MiniBarCell
    const container = screen.getByTestId("mini-bar-container");
    expect(container).toBeInTheDocument();
    // Displayed value text (bold)
    expect(screen.getByText(/75/)).toBeInTheDocument();
  });

  it("doesn't render minibar Quantity if setting is disabled or not present", () => {
    const qtyCol = createMockColumn({
      name: "score",
      display_name: "Score",
      semantic_type: "type/Quantity",
      base_type: "type/Number",
      settings: {
        show_mini_bar: false,
      },
    });
    const qtyColNoSetting = createMockColumn({
      name: "score2",
      display_name: "Score2",
      semantic_type: "type/Quantity",
      base_type: "type/Number",
    });
    const cols = [qtyCol, qtyColNoSetting];
    const row = [0, 0];
    const rows = [row];

    const settings = makeSettings({
      column: () => ({ number_style: "decimal" }),
    });

    renderItem({ row, rows, cols, settings, rightColumns: [qtyCol] });

    const container = screen.queryByTestId("mini-bar-container");
    expect(container).not.toBeInTheDocument();
  });
});
