import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { FieldPicker, type FieldPickerItem } from "./FieldPicker";

const STAGE_INDEX = 0;

interface SetupOpts {
  selectedColumnNames?: string[];
}

function createQuery(selectedColumnNames?: string[]) {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        fields: selectedColumnNames?.map((name) => ({
          type: "column",
          sourceName: "ORDERS",
          name,
        })),
      },
    ],
  });
}

function isColumnSelected({ columnInfo }: FieldPickerItem) {
  return Boolean(columnInfo.selected);
}

function isColumnDisabled(item: FieldPickerItem, items: FieldPickerItem[]) {
  const isOnlySelected = items.filter(isColumnSelected).length === 1;
  return isColumnSelected(item) && isOnlySelected;
}

function setup({ selectedColumnNames }: SetupOpts = {}) {
  const query = createQuery(selectedColumnNames);
  const columns = Lib.fieldableColumns(query, STAGE_INDEX);
  const onToggle = jest.fn();
  const onToggleColumns = jest.fn();

  renderWithProviders(
    <FieldPicker
      query={query}
      stageIndex={STAGE_INDEX}
      columns={columns}
      isColumnSelected={isColumnSelected}
      isColumnDisabled={isColumnDisabled}
      onToggle={onToggle}
      onToggleColumns={onToggleColumns}
      data-testid="fields-picker"
    />,
  );

  return { query, columns, onToggle, onToggleColumns };
}

function getOptions() {
  return within(screen.getByRole("listbox")).getAllByRole("option");
}

function getColumnNames(query: Lib.Query, columns: Lib.ColumnMetadata[]) {
  return columns.map(
    (column) => Lib.displayInfo(query, STAGE_INDEX, column).name,
  );
}

function getToggledColumnName(
  onToggle: jest.Mock,
  query: Lib.Query,
): [string, boolean] {
  const [column, isSelected] = onToggle.mock.calls[0];
  return [Lib.displayInfo(query, STAGE_INDEX, column).name, isSelected];
}

function getToggledColumnNames(
  onToggleColumns: jest.Mock,
  query: Lib.Query,
): [string[], boolean] {
  const [columns, isSelected] = onToggleColumns.mock.calls[0];
  return [getColumnNames(query, columns), isSelected];
}

describe("FieldPicker", () => {
  it("should render the columns as a multiselectable listbox", () => {
    const { columns } = setup();

    expect(screen.getByRole("listbox")).toHaveAttribute(
      "aria-multiselectable",
      "true",
    );
    expect(getOptions()).toHaveLength(columns.length);
    expect(screen.getByLabelText("Select all")).toBeChecked();
  });

  it("should reflect selection and disabled state on the options", () => {
    setup({ selectedColumnNames: ["ID"] });

    expect(screen.getByRole("option", { name: "ID" })).toBeChecked();
    expect(screen.getByRole("option", { name: "ID" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("option", { name: "Tax" })).not.toBeChecked();
    expect(screen.getByRole("option", { name: "Tax" })).not.toHaveAttribute(
      "aria-disabled",
    );
  });

  it("should select a column when its option is clicked", async () => {
    const { onToggle, query } = setup({ selectedColumnNames: ["ID"] });

    await userEvent.click(screen.getByRole("option", { name: "Tax" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(getToggledColumnName(onToggle, query)).toEqual(["TAX", true]);
  });

  it("should deselect a selected column", async () => {
    const { onToggle, query } = setup({ selectedColumnNames: ["ID", "TAX"] });

    await userEvent.click(screen.getByRole("option", { name: "Tax" }));

    expect(getToggledColumnName(onToggle, query)).toEqual(["TAX", false]);
  });

  it("should not toggle a disabled column", async () => {
    const { onToggle } = setup({ selectedColumnNames: ["ID"] });

    await userEvent.click(screen.getByRole("option", { name: "ID" }));

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("should navigate the list with the arrow keys and toggle with Enter", async () => {
    const { onToggle, query, columns } = setup();
    const [, secondColumnName] = getColumnNames(query, columns);

    screen.getByLabelText("Select all").focus();
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(getToggledColumnName(onToggle, query)).toEqual([
      secondColumnName,
      false,
    ]);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("should select the remaining columns and skip disabled ones", async () => {
    const { onToggleColumns, query, columns } = setup({
      selectedColumnNames: ["ID"],
    });

    await userEvent.click(screen.getByLabelText("Select all"));

    expect(getToggledColumnNames(onToggleColumns, query)).toEqual([
      getColumnNames(query, columns).filter((name) => name !== "ID"),
      true,
    ]);
  });

  it("should deselect every column when all of them are selected", async () => {
    const { onToggleColumns, query, columns } = setup();

    await userEvent.click(screen.getByLabelText("Select all"));

    expect(getToggledColumnNames(onToggleColumns, query)).toEqual([
      getColumnNames(query, columns),
      false,
    ]);
  });
});
