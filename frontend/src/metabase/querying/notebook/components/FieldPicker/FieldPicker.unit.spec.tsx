import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import { setupForContentTranslationTest } from "metabase/content-translation/test-utils";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { FieldPicker, type FieldPickerItem } from "./FieldPicker";

const STAGE_INDEX = 0;
const SEARCHABLE_COLUMN_COUNT = 5;

interface SetupOpts {
  columnCount?: number;
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

function createFieldPicker({
  columnCount,
  selectedColumnNames,
}: SetupOpts = {}) {
  const query = createQuery(selectedColumnNames);
  const allColumns = Lib.fieldableColumns(query, STAGE_INDEX);
  const columns = columnCount ? allColumns.slice(0, columnCount) : allColumns;
  const onToggle = jest.fn();
  const onSelectAll = jest.fn();
  const onSelectNone = jest.fn();

  const component = (
    <FieldPicker
      query={query}
      stageIndex={STAGE_INDEX}
      columns={columns}
      isColumnSelected={isColumnSelected}
      isColumnDisabled={isColumnDisabled}
      onToggle={onToggle}
      onSelectAll={onSelectAll}
      onSelectNone={onSelectNone}
      data-testid="fields-picker"
    />
  );

  return { component, query, columns, onToggle, onSelectAll, onSelectNone };
}

function setup(opts: SetupOpts = {}) {
  const { component, ...rest } = createFieldPicker(opts);
  renderWithProviders(component);
  return rest;
}

function getSearchInput() {
  return screen.getByRole("textbox", { name: "Search columns" });
}

function getColumnCheckboxes() {
  return within(screen.getByRole("list")).getAllByRole("checkbox");
}

describe("FieldPicker", () => {
  it("should not show a search box when there are few columns", () => {
    setup({ columnCount: SEARCHABLE_COLUMN_COUNT });

    expect(
      screen.queryByRole("textbox", { name: "Search columns" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Select all")).toBeInTheDocument();
  });

  it("should show a focused search box when there are many columns", () => {
    const { columns } = setup();

    expect(columns.length).toBeGreaterThan(SEARCHABLE_COLUMN_COUNT);
    expect(getSearchInput()).toHaveFocus();
    // "Select all" plus one checkbox per column
    expect(getColumnCheckboxes()).toHaveLength(columns.length + 1);
  });

  it("should filter columns case-insensitively and hide 'Select all' while searching", async () => {
    setup();

    await userEvent.type(getSearchInput(), "TOT");

    expect(screen.getByLabelText("Total")).toBeInTheDocument();
    expect(screen.getByLabelText("Subtotal")).toBeInTheDocument();
    expect(screen.queryByLabelText("Tax")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Select all")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 columns found");
  });

  it("should keep the search box while the filtered list is short", async () => {
    setup();

    await userEvent.type(getSearchInput(), "tax");

    expect(getColumnCheckboxes()).toHaveLength(1);
    expect(getSearchInput()).toBeInTheDocument();
  });

  it("should show an empty state when nothing matches", async () => {
    setup();

    await userEvent.type(getSearchInput(), "does not exist");

    expect(screen.getByText("No columns found")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0 columns found");
  });

  it("should toggle a column from the filtered list", async () => {
    const { onToggle, query } = setup({ selectedColumnNames: ["ID"] });

    await userEvent.type(getSearchInput(), "tax");
    await userEvent.click(screen.getByLabelText("Tax"));

    expect(onToggle).toHaveBeenCalledTimes(1);
    const [column, isSelected] = onToggle.mock.calls[0];
    expect(Lib.displayInfo(query, STAGE_INDEX, column).name).toBe("TAX");
    expect(isSelected).toBe(true);
  });

  it("should restore the full list when the search is cleared", async () => {
    const { columns } = setup();

    await userEvent.type(getSearchInput(), "tax");
    await userEvent.click(screen.getByRole("button", { name: "close icon" }));

    expect(getSearchInput()).toHaveValue("");
    expect(screen.getByLabelText("Select all")).toBeInTheDocument();
    expect(getColumnCheckboxes()).toHaveLength(columns.length + 1);
  });

  it("should clear the search on Escape without bubbling to the popover", async () => {
    setup();
    const input = getSearchInput();

    await userEvent.type(input, "tax");
    await userEvent.type(input, "{Escape}");

    expect(input).toHaveValue("");
    expect(screen.getByLabelText("Select all")).toBeInTheDocument();
  });

  it("should move focus to the first enabled checkbox on ArrowDown", async () => {
    setup();

    await userEvent.type(getSearchInput(), "{ArrowDown}");

    expect(screen.getByLabelText("Select all")).toHaveFocus();
  });

  it("should skip disabled checkboxes when moving focus on ArrowDown", async () => {
    setup({ selectedColumnNames: ["ID"] });

    await userEvent.type(getSearchInput(), "id");
    await userEvent.type(getSearchInput(), "{ArrowDown}");

    expect(screen.getByLabelText("ID")).toBeDisabled();
    expect(screen.getByLabelText("User ID")).toHaveFocus();
  });

  describe("content translation", () => {
    it("should match against the translated column name", async () => {
      const { component } = createFieldPicker();
      setupForContentTranslationTest({
        component,
        enterprisePlugins: ["content_translation"],
        tokenFeatures: { content_translation: true },
        staticallyEmbedded: true,
        dictionary: [{ msgid: "Tax", msgstr: "Impuesto", locale: "en" }],
      });

      expect(await screen.findByLabelText("Impuesto")).toBeInTheDocument();

      await userEvent.type(getSearchInput(), "impu");

      expect(getColumnCheckboxes()).toHaveLength(1);
      expect(screen.getByLabelText("Impuesto")).toBeInTheDocument();
    });
  });
});
