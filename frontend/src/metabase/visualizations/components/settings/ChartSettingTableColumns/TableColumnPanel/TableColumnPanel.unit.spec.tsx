import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type {
  DatasetColumn,
  TableColumnOrderSetting,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockTableColumnOrderSetting,
} from "metabase-types/api/mocks";
import { ORDERS } from "metabase-types/api/mocks/presets";

import { TableColumnPanel } from "./TableColumnPanel";

const COLUMNS = [
  createMockColumn({
    id: ORDERS.ID,
    name: "ID",
    display_name: "ID",
    field_ref: ["field", ORDERS.ID, null],
  }),
  createMockColumn({
    id: ORDERS.TOTAL,
    name: "TOTAL",
    display_name: "Total",
    field_ref: ["field", ORDERS.TOTAL, null],
  }),
  createMockColumn({
    id: ORDERS.TAX,
    name: "TAX",
    display_name: "Tax",
    field_ref: ["field", ORDERS.TAX, null],
  }),
  createMockColumn({
    id: ORDERS.SUBTOTAL,
    name: "SUBTOTAL",
    display_name: "Subtotal",
    field_ref: ["field", ORDERS.SUBTOTAL, null],
  }),
];

const COLUMN_SETTINGS = [
  createMockTableColumnOrderSetting({
    name: "TOTAL",
    enabled: true,
  }),
  createMockTableColumnOrderSetting({
    name: "ID",
    enabled: true,
  }),
  createMockTableColumnOrderSetting({
    name: "TAX",
    enabled: false,
  }),
  createMockTableColumnOrderSetting({
    name: "SUBTOTAL",
    enabled: false,
  }),
];

interface SetupOpts {
  columns?: DatasetColumn[];
  columnSettings?: TableColumnOrderSetting[];
  isShowingDetailsOnlyColumns?: boolean;
  getColumnName?: (column: DatasetColumn) => string;
}

function setup({
  columns = COLUMNS,
  columnSettings = COLUMN_SETTINGS,
  isShowingDetailsOnlyColumns = false,
  getColumnName = (column) => column.display_name,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onShowWidget = jest.fn();

  renderWithProviders(
    <TableColumnPanel
      columns={columns}
      columnSettings={columnSettings}
      isShowingDetailsOnlyColumns={isShowingDetailsOnlyColumns}
      getColumnName={getColumnName}
      onChange={onChange}
      onShowWidget={onShowWidget}
    />,
  );

  return { onChange };
}

describe("DatasetColumnSelector", () => {
  it("should display columns in the order of the setting", () => {
    setup();
    const items = screen.getAllByTestId(/draggable-item/);
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent("Total");
    expect(items[1]).toHaveTextContent("ID");
    expect(items[2]).toHaveTextContent("Tax");
    expect(items[3]).toHaveTextContent("Subtotal");
  });

  it("should allow to enable a column", async () => {
    const { onChange } = setup();

    await enableColumn("Tax");

    const columnIndex = findColumnIndex("TAX", COLUMN_SETTINGS);
    const newSettings = [...COLUMN_SETTINGS];
    newSettings[columnIndex] = { ...newSettings[columnIndex], enabled: true };
    expect(onChange).toHaveBeenCalledWith(newSettings);
  });

  it("should allow to disable a column", async () => {
    const { onChange } = setup();

    await disableColumn("ID");

    const columnIndex = findColumnIndex("ID", COLUMN_SETTINGS);
    const newSettings = [...COLUMN_SETTINGS];
    newSettings[columnIndex] = { ...newSettings[columnIndex], enabled: false };
    expect(onChange).toHaveBeenCalledWith(newSettings);
  });

  it("should not show columns that are 'details-only' by default", () => {
    setup({
      columns: [
        COLUMNS[0],
        COLUMNS[1],
        { ...COLUMNS[2], visibility_type: "details-only" },
        COLUMNS[3],
      ],
      columnSettings: COLUMN_SETTINGS,
    });

    const items = screen.getAllByTestId(/draggable-item/);
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Total");
    expect(items[1]).toHaveTextContent("ID");
    expect(items[2]).toHaveTextContent("Subtotal");
  });

  it("should be able to disable columns when 'details-only' columns are hidden", async () => {
    const { onChange } = setup({
      columns: [
        COLUMNS[0],
        COLUMNS[1],
        { ...COLUMNS[2], visibility_type: "details-only" },
        COLUMNS[3],
      ],
      columnSettings: COLUMN_SETTINGS,
    });

    await disableColumn("ID");

    const columnIndex = findColumnIndex("ID", COLUMN_SETTINGS);
    const newSettings = [...COLUMN_SETTINGS];
    newSettings[columnIndex] = { ...newSettings[columnIndex], enabled: false };
    expect(onChange).toHaveBeenCalledWith(newSettings);
  });

  it("should show columns that are 'details-only' if enabled", () => {
    setup({
      columns: [
        COLUMNS[0],
        COLUMNS[1],
        { ...COLUMNS[2], visibility_type: "details-only" },
        COLUMNS[3],
      ],
      columnSettings: COLUMN_SETTINGS,
      isShowingDetailsOnlyColumns: true,
    });

    const items = screen.getAllByTestId(/draggable-item/);
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent("Total");
    expect(items[1]).toHaveTextContent("ID");
    expect(items[2]).toHaveTextContent("Tax");
    expect(items[3]).toHaveTextContent("Subtotal");
  });
});

async function enableColumn(columnName: string) {
  await userEvent.click(screen.getByTestId(`${columnName}-show-button`));
}

async function disableColumn(columnName: string) {
  await userEvent.click(screen.getByTestId(`${columnName}-hide-button`));
}

function findColumnIndex(
  columnName: string,
  settings: TableColumnOrderSetting[],
) {
  return settings.findIndex((setting) => setting.name === columnName);
}
