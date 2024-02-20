import userEvent from "@testing-library/user-event";

import { screen, renderWithProviders } from "__support__/ui";
import type * as Lib from "metabase-lib";
import { createQuery } from "metabase-lib/test-helpers";
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
    fieldRef: ["field", ORDERS.TOTAL, null],
    enabled: true,
  }),
  createMockTableColumnOrderSetting({
    name: "ID",
    fieldRef: ["field", ORDERS.ID, null],
    enabled: true,
  }),
  createMockTableColumnOrderSetting({
    name: "TAX",
    fieldRef: ["field", ORDERS.TAX, null],
    enabled: false,
  }),
  createMockTableColumnOrderSetting({
    name: "SUBTOTAL",
    fieldRef: ["field", ORDERS.SUBTOTAL, null],
    enabled: false,
  }),
];

interface SetupOpts {
  query?: Lib.Query;
  stageIndex?: number;
  columns?: DatasetColumn[];
  columnSettings?: TableColumnOrderSetting[];
  getColumnName?: (column: DatasetColumn) => string;
}

function setup({
  query = createQuery(),
  stageIndex = -1,
  columns = COLUMNS,
  columnSettings = COLUMN_SETTINGS,
  getColumnName = column => column.display_name,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onShowWidget = jest.fn();

  renderWithProviders(
    <TableColumnPanel
      query={query}
      stageIndex={stageIndex}
      columns={columns}
      columnSettings={columnSettings}
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

  it("should allow to enable a column", () => {
    const { onChange } = setup();

    enableColumn("Tax");

    const columnIndex = findColumnIndex("TAX", COLUMN_SETTINGS);
    const newSettings = [...COLUMN_SETTINGS];
    newSettings[columnIndex] = { ...newSettings[columnIndex], enabled: true };
    expect(onChange).toHaveBeenCalledWith(newSettings);
  });

  it("should allow to disable a column", () => {
    const { onChange } = setup();

    disableColumn("ID");

    const columnIndex = findColumnIndex("ID", COLUMN_SETTINGS);
    const newSettings = [...COLUMN_SETTINGS];
    newSettings[columnIndex] = { ...newSettings[columnIndex], enabled: false };
    expect(onChange).toHaveBeenCalledWith(newSettings);
  });
});

function enableColumn(columnName: string) {
  userEvent.click(screen.getByTestId(`${columnName}-show-button`));
}

function disableColumn(columnName: string) {
  userEvent.click(screen.getByTestId(`${columnName}-hide-button`));
}

function findColumnIndex(
  columnName: string,
  settings: TableColumnOrderSetting[],
) {
  return settings.findIndex(setting => setting.name === columnName);
}
