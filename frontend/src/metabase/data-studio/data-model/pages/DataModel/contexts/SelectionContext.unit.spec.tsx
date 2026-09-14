import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import type { DatabaseId, TableId } from "metabase-types/api";

import { SelectionProvider, useSelection } from "./SelectionContext";

const FIRST_TABLE_ID: TableId = 10;
const SECOND_TABLE_ID: TableId = 20;
const DATABASE_ID: DatabaseId = 30;
const SCHEMA_ID = `${DATABASE_ID}:PUBLIC`;

function SelectionHarness() {
  const {
    selectedTables,
    setSelectedTables,
    selectedSchemas,
    setSelectedSchemas,
    selectedDatabases,
    setSelectedDatabases,
    resetSelection,
    filterSelectedTables,
    hasSelectedItems,
    selectedItemsCount,
    hasOnlyOneTableSelected,
    hasSelectedMoreThanOneTable,
  } = useSelection();

  const selectItems = () => {
    setSelectedTables(new Set([FIRST_TABLE_ID, SECOND_TABLE_ID]));
    setSelectedSchemas(new Set([SCHEMA_ID]));
    setSelectedDatabases(new Set([DATABASE_ID]));
  };

  return (
    <>
      <button onClick={selectItems}>Select items</button>
      <button onClick={resetSelection}>Reset selection</button>
      <button onClick={() => filterSelectedTables([SECOND_TABLE_ID])}>
        Filter tables
      </button>
      <output data-testid="selected-tables">
        {Array.from(selectedTables).join(",")}
      </output>
      <output data-testid="selected-schemas">
        {Array.from(selectedSchemas).join(",")}
      </output>
      <output data-testid="selected-databases">
        {Array.from(selectedDatabases).join(",")}
      </output>
      <output data-testid="has-selected-items">
        {String(hasSelectedItems)}
      </output>
      <output data-testid="selected-items-count">{selectedItemsCount}</output>
      <output data-testid="has-only-one-table">
        {String(hasOnlyOneTableSelected)}
      </output>
      <output data-testid="has-more-than-one-table">
        {String(hasSelectedMoreThanOneTable)}
      </output>
    </>
  );
}

function setup() {
  render(
    <SelectionProvider>
      <SelectionHarness />
    </SelectionProvider>,
  );
}

describe("SelectionContext", () => {
  it("resets table, schema, and database selection", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Select items" }));
    expect(screen.getByTestId("selected-tables")).toHaveTextContent("10,20");
    expect(screen.getByTestId("selected-schemas")).toHaveTextContent(SCHEMA_ID);
    expect(screen.getByTestId("selected-databases")).toHaveTextContent("30");
    expect(screen.getByTestId("has-selected-items")).toHaveTextContent("true");
    expect(screen.getByTestId("selected-items-count")).toHaveTextContent("4");
    expect(screen.getByTestId("has-only-one-table")).toHaveTextContent("false");
    expect(screen.getByTestId("has-more-than-one-table")).toHaveTextContent(
      "true",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Reset selection" }),
    );

    expect(screen.getByTestId("selected-tables")).toBeEmptyDOMElement();
    expect(screen.getByTestId("selected-schemas")).toBeEmptyDOMElement();
    expect(screen.getByTestId("selected-databases")).toBeEmptyDOMElement();
    expect(screen.getByTestId("has-selected-items")).toHaveTextContent("false");
    expect(screen.getByTestId("selected-items-count")).toHaveTextContent("0");
    expect(screen.getByTestId("has-only-one-table")).toHaveTextContent("false");
    expect(screen.getByTestId("has-more-than-one-table")).toHaveTextContent(
      "false",
    );
  });

  it("filters selected tables without changing schema or database selection", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Select items" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Filter tables" }),
    );

    expect(screen.getByTestId("selected-tables")).toHaveTextContent("20");
    expect(screen.getByTestId("selected-tables")).not.toHaveTextContent("10");
    expect(screen.getByTestId("selected-schemas")).toHaveTextContent(SCHEMA_ID);
    expect(screen.getByTestId("selected-databases")).toHaveTextContent("30");
  });
});
