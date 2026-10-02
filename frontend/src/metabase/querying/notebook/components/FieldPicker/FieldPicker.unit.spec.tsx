import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { setupForContentTranslationTest } from "metabase/content-translation/test-utils";
import * as Lib from "metabase-lib";

import {
  type SampleTableName,
  createSampleTableQuery,
  getColumnNames,
} from "../../test-utils";

import {
  FieldPicker,
  type FieldPickerItem,
  MIN_SEARCHABLE_COLUMN_COUNT,
} from "./FieldPicker";

const STAGE_INDEX = 0;

interface SetupOpts {
  tableName?: SampleTableName;
  selectedColumnNames?: string[];
}

function isColumnSelected({ columnInfo }: FieldPickerItem) {
  return Boolean(columnInfo.selected);
}

function isColumnDisabled(item: FieldPickerItem, items: FieldPickerItem[]) {
  const isOnlySelected = items.filter(isColumnSelected).length === 1;
  return isColumnSelected(item) && isOnlySelected;
}

function createFieldPicker({
  tableName = "ORDERS",
  selectedColumnNames,
}: SetupOpts = {}) {
  const query = createSampleTableQuery(tableName, selectedColumnNames);
  const columns = Lib.fieldableColumns(query, STAGE_INDEX);
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

function setupSearchable(opts: Omit<SetupOpts, "tableName"> = {}) {
  return setup({ ...opts, tableName: "PEOPLE" });
}

function getSearchInput() {
  return screen.getByLabelText("Search columns");
}

function getListbox() {
  return screen.getByRole("listbox", { name: "Columns" });
}

function getColumnOptions() {
  const columnGroup = within(getListbox()).getByRole("group");
  return within(columnGroup).getAllByRole("option");
}

function getOptionNames() {
  return getColumnOptions().map((option) => option.getAttribute("aria-label"));
}

function getHighlightedOptionName() {
  return getListbox()
    .querySelector("[data-combobox-selected]")
    ?.getAttribute("aria-label");
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
  return [getColumnNames(query, STAGE_INDEX, columns), isSelected];
}

describe("FieldPicker", () => {
  it("should render the columns as a multiselectable listbox", () => {
    const { columns } = setup();

    expect(screen.getByRole("listbox")).toHaveAttribute(
      "aria-multiselectable",
      "true",
    );
    expect(getColumnOptions()).toHaveLength(columns.length);
    expect(screen.getByRole("option", { name: "Select all" })).toBeChecked();
  });

  it("should not show a search box when there are few columns", () => {
    const { columns } = setup();

    expect(columns.length).toBeLessThan(MIN_SEARCHABLE_COLUMN_COUNT);
    expect(screen.queryByLabelText("Search columns")).not.toBeInTheDocument();
    expect(getListbox()).toHaveAttribute("data-autofocus");
  });

  it("should reflect selection and disabled state on the options", () => {
    setup({ selectedColumnNames: ["ID"] });

    expect(screen.getByRole("option", { name: "ID" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("option", { name: "ID" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("option", { name: "Tax" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
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

  it("should navigate the list from the listbox when there is no search box", async () => {
    const { onToggle, query, columns } = setup();
    const [, secondColumnName] = getColumnNames(query, STAGE_INDEX, columns);

    getListbox().focus();
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(getToggledColumnName(onToggle, query)).toEqual([
      secondColumnName,
      false,
    ]);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("should toggle the highlighted column with Space", async () => {
    const { onToggle, query, columns } = setup();
    const [firstColumnName] = getColumnNames(query, STAGE_INDEX, columns);

    getListbox().focus();
    await userEvent.keyboard(" ");

    expect(getToggledColumnName(onToggle, query)).toEqual([
      firstColumnName,
      false,
    ]);
  });

  it("should reach 'Select all' with the arrow keys", async () => {
    const { onToggle, onToggleColumns, query, columns } = setup();

    getListbox().focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(getHighlightedOptionName()).toBe("Select all");

    await userEvent.keyboard("{Enter}");

    expect(onToggle).not.toHaveBeenCalled();
    expect(getToggledColumnNames(onToggleColumns, query)).toEqual([
      getColumnNames(query, STAGE_INDEX, columns),
      false,
    ]);
  });

  it("should select the remaining columns and skip disabled ones", async () => {
    const { onToggleColumns, query, columns } = setup({
      selectedColumnNames: ["ID"],
    });

    await userEvent.click(screen.getByLabelText("Select all"));

    expect(getToggledColumnNames(onToggleColumns, query)).toEqual([
      getColumnNames(query, STAGE_INDEX, columns).filter(
        (name) => name !== "ID",
      ),
      true,
    ]);
  });

  it("should deselect every column when all of them are selected", async () => {
    const { onToggleColumns, query, columns } = setup();

    await userEvent.click(screen.getByLabelText("Select all"));

    expect(getToggledColumnNames(onToggleColumns, query)).toEqual([
      getColumnNames(query, STAGE_INDEX, columns),
      false,
    ]);
  });

  describe("searching", () => {
    it("should mark the search box for autofocus when there are many columns", () => {
      const { columns } = setupSearchable();

      expect(columns.length).toBeGreaterThanOrEqual(
        MIN_SEARCHABLE_COLUMN_COUNT,
      );
      expect(getSearchInput()).toHaveAttribute("data-autofocus");
      expect(getListbox()).not.toHaveAttribute("data-autofocus");
    });

    it("should filter columns case-insensitively", async () => {
      setupSearchable();

      await userEvent.type(getSearchInput(), "TUDE");

      expect(getOptionNames()).toEqual(["Latitude", "Longitude"]);
      expect(screen.getByRole("status")).toHaveTextContent("2 columns found");
    });

    it("should keep the search box while the filtered list is short", async () => {
      setupSearchable();

      await userEvent.type(getSearchInput(), "email");

      expect(getOptionNames()).toEqual(["Email"]);
      expect(getSearchInput()).toBeInTheDocument();
    });

    it("should show an empty state when nothing matches", async () => {
      setupSearchable();

      await userEvent.type(getSearchInput(), "does not exist");

      expect(screen.getByText("No columns found")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("0 columns found");
      expect(
        screen.queryByLabelText("Select all of these"),
      ).not.toBeInTheDocument();
    });

    it("should toggle a column by clicking it in the filtered list", async () => {
      const { onToggle, query } = setupSearchable({
        selectedColumnNames: ["ID"],
      });

      await userEvent.type(getSearchInput(), "email");
      await userEvent.click(screen.getByRole("option", { name: "Email" }));

      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(getToggledColumnName(onToggle, query)).toEqual(["EMAIL", true]);
    });

    it("should highlight the first match while typing and toggle it with Enter", async () => {
      const { onToggle, query } = setupSearchable({
        selectedColumnNames: ["ID"],
      });

      await userEvent.type(getSearchInput(), "email");
      expect(getHighlightedOptionName()).toBe("Email");

      await userEvent.keyboard("{Enter}");

      expect(getToggledColumnName(onToggle, query)).toEqual(["EMAIL", true]);
      expect(getSearchInput()).toHaveFocus();
    });

    it("should move the highlight with the arrow keys from the search box", async () => {
      const { onToggle, query } = setupSearchable({
        selectedColumnNames: ["ID"],
      });

      await userEvent.type(getSearchInput(), "tude");
      expect(getHighlightedOptionName()).toBe("Latitude");

      await userEvent.keyboard("{ArrowDown}");
      expect(getHighlightedOptionName()).toBe("Longitude");

      await userEvent.keyboard("{ArrowUp}");
      expect(getHighlightedOptionName()).toBe("Latitude");

      await userEvent.keyboard("{ArrowDown}{Enter}");
      expect(getToggledColumnName(onToggle, query)).toEqual([
        "LONGITUDE",
        true,
      ]);
    });

    it("should restore the full list when the search is cleared", async () => {
      const { columns } = setupSearchable();

      await userEvent.type(getSearchInput(), "email");
      await userEvent.click(screen.getByLabelText("Clear search"));

      expect(getSearchInput()).toHaveValue("");
      expect(
        screen.getByRole("option", { name: "Select all" }),
      ).toBeInTheDocument();
      expect(getColumnOptions()).toHaveLength(columns.length);
    });

    it("should return focus to the search box when the search is cleared", async () => {
      setupSearchable();

      await userEvent.type(getSearchInput(), "email");
      await userEvent.click(screen.getByLabelText("Clear search"));

      await waitFor(() => expect(getSearchInput()).toHaveFocus());
    });

    it("should render each column once across repeated searches", async () => {
      const { columns } = setupSearchable();
      const allNames = getOptionNames();

      for (const term of ["tude", "email", "zzz"]) {
        await userEvent.type(getSearchInput(), term);
        await userEvent.clear(getSearchInput());

        expect(getOptionNames()).toEqual(allNames);
        expect(getColumnOptions()).toHaveLength(columns.length);
        expect(screen.getAllByText("ID")).toHaveLength(1);
      }
    });

    describe("'Select all of these'", () => {
      it("should replace 'Select all' while searching and describe the match count", async () => {
        setupSearchable();

        await userEvent.type(getSearchInput(), "tude");

        const option = screen.getByRole("option", {
          name: "Select all of these",
        });
        expect(option).toBeChecked();
        expect(option).toHaveAccessibleDescription("2 columns found");
        expect(screen.queryByLabelText("Select all")).not.toBeInTheDocument();
      });

      it("should only select the matching columns that aren't selected yet", async () => {
        const { onToggleColumns, query } = setupSearchable({
          selectedColumnNames: ["ID", "LONGITUDE"],
        });

        await userEvent.type(getSearchInput(), "tude");
        const option = screen.getByRole("option", {
          name: "Select all of these",
        });
        // toBeChecked() throws on aria-checked="mixed", and toBePartiallyChecked()
        // only supports checkboxes, not options.
        // eslint-disable-next-line jest-dom/prefer-checked
        expect(option).toHaveAttribute("aria-checked", "mixed");
        await userEvent.click(option);

        expect(getToggledColumnNames(onToggleColumns, query)).toEqual([
          ["LATITUDE"],
          true,
        ]);
      });

      it("should only deselect the matching columns when they are all selected", async () => {
        const { onToggleColumns, query } = setupSearchable();

        await userEvent.type(getSearchInput(), "tude");
        await userEvent.click(screen.getByLabelText("Select all of these"));

        expect(getToggledColumnNames(onToggleColumns, query)).toEqual([
          ["LATITUDE", "LONGITUDE"],
          false,
        ]);
      });

      it("should be disabled when the only matches can't be toggled", async () => {
        setupSearchable({ selectedColumnNames: ["ID"] });

        await userEvent.type(getSearchInput(), "id");

        expect(getOptionNames()).toEqual(["ID"]);
        expect(
          screen.getByRole("option", { name: "Select all of these" }),
        ).toHaveAttribute("aria-disabled", "true");
      });
    });

    it("should match against the translated column name", async () => {
      const { component } = createFieldPicker({ tableName: "PEOPLE" });
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
