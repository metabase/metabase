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
  return screen.getByLabelText("Search columns");
}

function getOptions() {
  return within(screen.getByRole("listbox")).getAllByRole("option");
}

function getOptionNames() {
  return getOptions().map((option) => option.getAttribute("aria-label"));
}

function getHighlightedOptionName() {
  return screen
    .queryByRole("option", { selected: true })
    ?.getAttribute("aria-label");
}

function getToggledColumnName(
  onToggle: jest.Mock,
  query: Lib.Query,
): [string, boolean] {
  const [column, isSelected] = onToggle.mock.calls[0];
  return [Lib.displayInfo(query, STAGE_INDEX, column).name, isSelected];
}

describe("FieldPicker", () => {
  it("should not show a search box when there are few columns", () => {
    setup({ columnCount: SEARCHABLE_COLUMN_COUNT });

    expect(screen.queryByLabelText("Search columns")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Select all")).toBeInTheDocument();
    expect(getOptions()).toHaveLength(SEARCHABLE_COLUMN_COUNT);
  });

  it("should show a focused search box when there are many columns", () => {
    const { columns } = setup();

    expect(columns.length).toBeGreaterThan(SEARCHABLE_COLUMN_COUNT);
    expect(getSearchInput()).toHaveFocus();
    expect(screen.getByRole("listbox")).toHaveAttribute(
      "aria-multiselectable",
      "true",
    );
    expect(getOptions()).toHaveLength(columns.length);
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

  it("should filter columns case-insensitively and hide 'Select all' while searching", async () => {
    setup();

    await userEvent.type(getSearchInput(), "TOT");

    expect(getOptionNames()).toEqual(["Subtotal", "Total"]);
    expect(screen.queryByLabelText("Select all")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 columns found");
  });

  it("should keep the search box while the filtered list is short", async () => {
    setup();

    await userEvent.type(getSearchInput(), "tax");

    expect(getOptionNames()).toEqual(["Tax"]);
    expect(getSearchInput()).toBeInTheDocument();
  });

  it("should show an empty state when nothing matches", async () => {
    setup();

    await userEvent.type(getSearchInput(), "does not exist");

    expect(screen.getByText("No columns found")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0 columns found");
  });

  it("should toggle a column by clicking it in the filtered list", async () => {
    const { onToggle, query } = setup({ selectedColumnNames: ["ID"] });

    await userEvent.type(getSearchInput(), "tax");
    await userEvent.click(screen.getByRole("option", { name: "Tax" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(getToggledColumnName(onToggle, query)).toEqual(["TAX", true]);
  });

  it("should toggle a selected column off", async () => {
    const { onToggle, query } = setup({ selectedColumnNames: ["ID", "TAX"] });

    await userEvent.click(screen.getByRole("option", { name: "Tax" }));

    expect(getToggledColumnName(onToggle, query)).toEqual(["TAX", false]);
  });

  it("should not toggle a disabled column", async () => {
    const { onToggle } = setup({ selectedColumnNames: ["ID"] });

    await userEvent.click(screen.getByRole("option", { name: "ID" }));

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("should highlight the first match while typing and toggle it with Enter", async () => {
    const { onToggle, query } = setup({ selectedColumnNames: ["ID"] });

    await userEvent.type(getSearchInput(), "tax");
    expect(getHighlightedOptionName()).toBe("Tax");

    await userEvent.keyboard("{Enter}");

    expect(getToggledColumnName(onToggle, query)).toEqual(["TAX", true]);
    expect(getSearchInput()).toHaveFocus();
  });

  it("should move the highlight with the arrow keys from the search box", async () => {
    const { onToggle, query } = setup({ selectedColumnNames: ["ID"] });

    await userEvent.type(getSearchInput(), "tot");
    expect(getHighlightedOptionName()).toBe("Subtotal");

    await userEvent.keyboard("{ArrowDown}");
    expect(getHighlightedOptionName()).toBe("Total");

    await userEvent.keyboard("{ArrowUp}");
    expect(getHighlightedOptionName()).toBe("Subtotal");

    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(getToggledColumnName(onToggle, query)).toEqual(["TOTAL", true]);
  });

  it("should navigate the list from the 'Select all' checkbox when there is no search box", async () => {
    const { onToggle, query } = setup({
      columnCount: SEARCHABLE_COLUMN_COUNT,
      selectedColumnNames: ["ID"],
    });

    screen.getByLabelText("Select all").focus();
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(getToggledColumnName(onToggle, query)).toEqual(["USER_ID", true]);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("should restore the full list when the search is cleared", async () => {
    const { columns } = setup();

    await userEvent.type(getSearchInput(), "tax");
    await userEvent.click(screen.getByLabelText("Clear search"));

    expect(getSearchInput()).toHaveValue("");
    expect(screen.getByLabelText("Select all")).toBeInTheDocument();
    expect(getOptions()).toHaveLength(columns.length);
  });

  it("should render each column once across repeated searches", async () => {
    const { columns } = setup();
    const allNames = getOptionNames();

    for (const term of ["tot", "id", "zzz"]) {
      await userEvent.type(getSearchInput(), term);
      await userEvent.clear(getSearchInput());

      expect(getOptionNames()).toEqual(allNames);
      expect(getOptions()).toHaveLength(columns.length);
      expect(screen.getAllByText("ID")).toHaveLength(1);
    }
  });

  it("should clear the search on Escape without bubbling to the popover", async () => {
    setup();
    const input = getSearchInput();

    await userEvent.type(input, "tax");
    await userEvent.keyboard("{Escape}");

    expect(input).toHaveValue("");
    expect(screen.getByLabelText("Select all")).toBeInTheDocument();
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

      expect(
        await screen.findByRole("option", { name: "Impuesto" }),
      ).toBeInTheDocument();

      await userEvent.type(getSearchInput(), "impu");

      expect(getOptionNames()).toEqual(["Impuesto"]);
    });
  });
});
