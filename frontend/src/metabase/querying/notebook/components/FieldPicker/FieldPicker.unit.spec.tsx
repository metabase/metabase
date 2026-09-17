import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import { setupForContentTranslationTest } from "metabase/content-translation/test-utils";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { PEOPLE_ID } from "metabase-types/api/mocks/presets";

import {
  FieldPicker,
  type FieldPickerItem,
  SEARCHABLE_COLUMN_COUNT,
} from "./FieldPicker";

const STAGE_INDEX = 0;

interface SetupOpts {
  columnCount?: number;
  selectedColumnNames?: string[];
}

function createQuery(selectedColumnNames?: string[]) {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: PEOPLE_ID },
        fields: selectedColumnNames?.map((name) => ({
          type: "column",
          sourceName: "PEOPLE",
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
  const onToggleColumns = jest.fn();

  const component = (
    <FieldPicker
      query={query}
      stageIndex={STAGE_INDEX}
      columns={columns}
      isColumnSelected={isColumnSelected}
      isColumnDisabled={isColumnDisabled}
      onToggle={onToggle}
      onToggleColumns={onToggleColumns}
      data-testid="fields-picker"
    />
  );

  return { component, query, columns, onToggle, onToggleColumns };
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
  it("should not show a search box when there are few columns", () => {
    setup({ columnCount: SEARCHABLE_COLUMN_COUNT });

    expect(screen.queryByLabelText("Search columns")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Select all")).toBeInTheDocument();
    expect(getOptions()).toHaveLength(SEARCHABLE_COLUMN_COUNT);
  });

  it("should mark the search box for autofocus when there are many columns", () => {
    const { columns } = setup();

    expect(columns.length).toBeGreaterThan(SEARCHABLE_COLUMN_COUNT);
    expect(getSearchInput()).toHaveAttribute("data-autofocus");
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
    expect(screen.getByRole("option", { name: "Email" })).not.toBeChecked();
    expect(screen.getByRole("option", { name: "Email" })).not.toHaveAttribute(
      "aria-disabled",
    );
  });

  it("should filter columns case-insensitively", async () => {
    setup();

    await userEvent.type(getSearchInput(), "TUDE");

    expect(getOptionNames()).toEqual(["Latitude", "Longitude"]);
    expect(screen.getByRole("status")).toHaveTextContent("2 columns found");
  });

  it("should keep the search box while the filtered list is short", async () => {
    setup();

    await userEvent.type(getSearchInput(), "email");

    expect(getOptionNames()).toEqual(["Email"]);
    expect(getSearchInput()).toBeInTheDocument();
  });

  it("should show an empty state when nothing matches", async () => {
    setup();

    await userEvent.type(getSearchInput(), "does not exist");

    expect(screen.getByText("No columns found")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0 columns found");
    expect(
      screen.queryByLabelText("Select all of these"),
    ).not.toBeInTheDocument();
  });

  it("should toggle a column by clicking it in the filtered list", async () => {
    const { onToggle, query } = setup({ selectedColumnNames: ["ID"] });

    await userEvent.type(getSearchInput(), "email");
    await userEvent.click(screen.getByRole("option", { name: "Email" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(getToggledColumnName(onToggle, query)).toEqual(["EMAIL", true]);
  });

  it("should toggle a selected column off", async () => {
    const { onToggle, query } = setup({ selectedColumnNames: ["ID", "EMAIL"] });

    await userEvent.click(screen.getByRole("option", { name: "Email" }));

    expect(getToggledColumnName(onToggle, query)).toEqual(["EMAIL", false]);
  });

  it("should not toggle a disabled column", async () => {
    const { onToggle } = setup({ selectedColumnNames: ["ID"] });

    await userEvent.click(screen.getByRole("option", { name: "ID" }));

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("should highlight the first match while typing and toggle it with Enter", async () => {
    const { onToggle, query } = setup({ selectedColumnNames: ["ID"] });

    await userEvent.type(getSearchInput(), "email");
    expect(getHighlightedOptionName()).toBe("Email");

    await userEvent.keyboard("{Enter}");

    expect(getToggledColumnName(onToggle, query)).toEqual(["EMAIL", true]);
    expect(getSearchInput()).toHaveFocus();
  });

  it("should move the highlight with the arrow keys from the search box", async () => {
    const { onToggle, query } = setup({ selectedColumnNames: ["ID"] });

    await userEvent.type(getSearchInput(), "tude");
    expect(getHighlightedOptionName()).toBe("Latitude");

    await userEvent.keyboard("{ArrowDown}");
    expect(getHighlightedOptionName()).toBe("Longitude");

    await userEvent.keyboard("{ArrowUp}");
    expect(getHighlightedOptionName()).toBe("Latitude");

    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(getToggledColumnName(onToggle, query)).toEqual(["LONGITUDE", true]);
  });

  it("should navigate the list from the 'Select all' checkbox when there is no search box", async () => {
    const { onToggle, query, columns } = setup({
      columnCount: SEARCHABLE_COLUMN_COUNT,
    });
    const [, secondColumnName] = getColumnNames(query, columns);

    screen.getByLabelText("Select all").focus();
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(getToggledColumnName(onToggle, query)).toEqual([
      secondColumnName,
      false,
    ]);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("should restore the full list when the search is cleared", async () => {
    const { columns } = setup();

    await userEvent.type(getSearchInput(), "email");
    await userEvent.click(screen.getByLabelText("Clear search"));

    expect(getSearchInput()).toHaveValue("");
    expect(screen.getByLabelText("Select all")).toBeInTheDocument();
    expect(getOptions()).toHaveLength(columns.length);
  });

  it("should render each column once across repeated searches", async () => {
    const { columns } = setup();
    const allNames = getOptionNames();

    for (const term of ["tude", "email", "zzz"]) {
      await userEvent.type(getSearchInput(), term);
      await userEvent.clear(getSearchInput());

      expect(getOptionNames()).toEqual(allNames);
      expect(getOptions()).toHaveLength(columns.length);
      expect(screen.getAllByText("ID")).toHaveLength(1);
    }
  });

  describe("'Select all'", () => {
    it("should deselect every column when all of them are selected", async () => {
      const { onToggleColumns, query, columns } = setup();

      await userEvent.click(screen.getByLabelText("Select all"));

      expect(getToggledColumnNames(onToggleColumns, query)).toEqual([
        getColumnNames(query, columns),
        false,
      ]);
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
  });

  describe("'Select all of these'", () => {
    it("should replace 'Select all' while searching and describe the match count", async () => {
      setup();

      await userEvent.type(getSearchInput(), "tude");

      const checkbox = screen.getByLabelText("Select all of these");
      expect(checkbox).toBeChecked();
      expect(checkbox).toHaveAccessibleDescription("2 columns found");
      expect(screen.queryByLabelText("Select all")).not.toBeInTheDocument();
    });

    it("should only select the matching columns that aren't selected yet", async () => {
      const { onToggleColumns, query } = setup({
        selectedColumnNames: ["ID", "LONGITUDE"],
      });

      await userEvent.type(getSearchInput(), "tude");
      const checkbox = screen.getByLabelText("Select all of these");
      expect(checkbox).not.toBeChecked();
      await userEvent.click(checkbox);

      expect(getToggledColumnNames(onToggleColumns, query)).toEqual([
        ["LATITUDE"],
        true,
      ]);
    });

    it("should only deselect the matching columns when they are all selected", async () => {
      const { onToggleColumns, query } = setup();

      await userEvent.type(getSearchInput(), "tude");
      await userEvent.click(screen.getByLabelText("Select all of these"));

      expect(getToggledColumnNames(onToggleColumns, query)).toEqual([
        ["LATITUDE", "LONGITUDE"],
        false,
      ]);
    });

    it("should be disabled when the only matches can't be toggled", async () => {
      setup({ selectedColumnNames: ["ID"] });

      await userEvent.type(getSearchInput(), "id");

      expect(getOptionNames()).toEqual(["ID"]);
      expect(screen.getByLabelText("Select all of these")).toBeDisabled();
    });
  });

  describe("content translation", () => {
    it("should match against the translated column name", async () => {
      const { component } = createFieldPicker();
      setupForContentTranslationTest({
        component,
        enterprisePlugins: ["content_translation"],
        tokenFeatures: { content_translation: true },
        staticallyEmbedded: true,
        dictionary: [{ msgid: "Email", msgstr: "Correo", locale: "en" }],
      });

      expect(
        await screen.findByRole("option", { name: "Correo" }),
      ).toBeInTheDocument();

      await userEvent.type(getSearchInput(), "corr");

      expect(getOptionNames()).toEqual(["Correo"]);
    });
  });
});
