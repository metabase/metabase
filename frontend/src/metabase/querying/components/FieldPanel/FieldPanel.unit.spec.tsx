import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  columnFinder,
  createQuery,
  createQueryWithClauses,
} from "metabase-lib/test-helpers";
import { PRODUCTS_ID } from "metabase-types/api/mocks/presets";

import { FieldPanel } from "./FieldPanel";

interface TestProps {
  query: Lib.Query;
  stageIndex: number;
}

function Test({ query: initialQuery, stageIndex }: TestProps) {
  const [query, setQuery] = useState(initialQuery);

  return (
    <FieldPanel query={query} stageIndex={stageIndex} onChange={setQuery} />
  );
}

type SetupOpts = {
  query?: Lib.Query;
  stageIndex?: number;
};

function setup({ query = createQuery(), stageIndex = -1 }: SetupOpts = {}) {
  renderWithProviders(<Test query={query} stageIndex={stageIndex} />);
}

describe("QueryColumnPicker", () => {
  it("should allow to add and remove a column", async () => {
    setup();
    const taxColumn = screen.getByRole("checkbox", { name: "Tax" });
    const totalColumn = screen.getByRole("checkbox", { name: "Total" });
    expect(taxColumn).toBeChecked();
    expect(totalColumn).toBeChecked();

    await userEvent.click(taxColumn);
    expect(taxColumn).not.toBeChecked();
    expect(totalColumn).toBeChecked();

    await userEvent.click(totalColumn);
    expect(taxColumn).not.toBeChecked();
    expect(totalColumn).not.toBeChecked();

    await userEvent.click(taxColumn);
    expect(taxColumn).toBeChecked();
    expect(totalColumn).not.toBeChecked();

    await userEvent.click(totalColumn);
    expect(taxColumn).toBeChecked();
    expect(totalColumn).toBeChecked();
  });

  it("should allow to add and remove an implicitly joinable column", async () => {
    setup();
    const categoryColumn = screen.getByRole("checkbox", { name: "Category" });
    const vendorColumn = screen.getByRole("checkbox", { name: "Vendor" });
    expect(categoryColumn).not.toBeChecked();
    expect(vendorColumn).not.toBeChecked();

    await userEvent.click(categoryColumn);
    expect(categoryColumn).toBeChecked();
    expect(vendorColumn).not.toBeChecked();

    await userEvent.click(vendorColumn);
    expect(categoryColumn).toBeChecked();
    expect(vendorColumn).toBeChecked();

    await userEvent.click(categoryColumn);
    expect(categoryColumn).not.toBeChecked();
    expect(vendorColumn).toBeChecked();

    await userEvent.click(vendorColumn);
    expect(categoryColumn).not.toBeChecked();
    expect(vendorColumn).not.toBeChecked();
  });

  it("should allow to add and remove column groups", async () => {
    setup();
    const productGroup = screen.getByRole("checkbox", { name: "Product" });
    const categoryColumn = screen.getByRole("checkbox", { name: "Category" });
    const vendorColumn = screen.getByRole("checkbox", { name: "Vendor" });
    expect(productGroup).not.toBeChecked();
    expect(categoryColumn).not.toBeChecked();
    expect(vendorColumn).not.toBeChecked();

    await userEvent.click(productGroup);
    expect(productGroup).toBeChecked();
    expect(categoryColumn).toBeChecked();
    expect(vendorColumn).toBeChecked();

    await userEvent.click(productGroup);
    expect(productGroup).not.toBeChecked();
    expect(categoryColumn).not.toBeChecked();
    expect(vendorColumn).not.toBeChecked();
  });

  it("should not allow to remove the last column from the data source one by one", async () => {
    setup();
    const [orderGroup, firstColumn, ...otherColumns] =
      screen.getAllByRole("checkbox");
    expect(orderGroup).toBeChecked();
    expect(orderGroup).toBeEnabled();

    for (const column of otherColumns) {
      await userEvent.click(column);
    }
    expect(firstColumn).toBeChecked();
    expect(firstColumn).toBeDisabled();
    expect(orderGroup).toBeEnabled();
    expect(orderGroup).not.toBeChecked();
  });

  it("should not allow to remove the last column from the data source via group", async () => {
    setup({ query: Lib.withDifferentTable(createQuery(), PRODUCTS_ID) });
    const [orderGroup, firstColumn, ...otherColumns] =
      screen.getAllByRole("checkbox");
    expect(orderGroup).toBeChecked();
    expect(orderGroup).toBeEnabled();

    await userEvent.click(orderGroup);
    expect(orderGroup).not.toBeChecked();
    expect(orderGroup).toBeEnabled();
    expect(firstColumn).toBeChecked();
    expect(firstColumn).toBeDisabled();
    for (const column of otherColumns) {
      expect(column).not.toBeChecked();
      expect(column).toBeEnabled();
    }

    await userEvent.click(orderGroup);
    expect(firstColumn).toBeChecked();
    expect(firstColumn).toBeEnabled();
    for (const column of otherColumns) {
      expect(column).toBeChecked();
      expect(column).toBeEnabled();
    }
  });

  it("should not allow to remove fields for aggregated queries", async () => {
    setup({
      query: createQueryWithClauses({
        query: createQuery(),
        aggregations: [
          { operatorName: "count" },
          { operatorName: "sum", columnName: "PRICE", tableName: "PRODUCTS" },
        ],
      }),
    });

    const [group, ...columns] = screen.getAllByRole("checkbox");
    expect(group).toBeChecked();
    expect(group).toBeDisabled();
    for (const column of columns) {
      expect(column).toBeChecked();
      expect(column).toBeDisabled();
    }
  });

  it("should not allow to remove fields for breakout queries", async () => {
    setup({
      query: createQueryWithClauses({
        query: createQuery(),
        breakouts: [{ tableName: "PRODUCTS", columnName: "PRICE" }],
      }),
    });

    const [group, ...columns] = screen.getAllByRole("checkbox");
    expect(group).toBeChecked();
    expect(group).toBeDisabled();
    for (const column of columns) {
      expect(column).toBeChecked();
      expect(column).toBeDisabled();
    }
  });

  it("should not allow to remove the only field from multi-stage queries", () => {
    const initialQuery = Lib.appendStage(
      createQueryWithClauses({
        query: createQuery(),
        breakouts: [{ tableName: "PRODUCTS", columnName: "PRICE" }],
      }),
    );
    const stageIndex = 1;
    const findColumn = columnFinder(
      initialQuery,
      Lib.fieldableColumns(initialQuery, stageIndex),
    );
    setup({
      query: Lib.filter(
        initialQuery,
        stageIndex,
        Lib.numberFilterClause({
          operator: "=",
          column: findColumn("PRODUCTS", "PRICE"),
          values: [1],
        }),
      ),
    });

    const [group, ...columns] = screen.getAllByRole("checkbox");
    expect(group).toBeChecked();
    expect(group).toBeDisabled();
    expect(columns.length).toBe(1);
    for (const column of columns) {
      expect(column).toBeChecked();
      expect(column).toBeDisabled();
    }
  });

  it("should allow to remove some but not all fields from multi-stage queries", async () => {
    const initialQuery = Lib.appendStage(
      createQueryWithClauses({
        query: createQuery(),
        breakouts: [
          { tableName: "PRODUCTS", columnName: "PRICE" },
          { tableName: "PRODUCTS", columnName: "CREATED_AT" },
        ],
      }),
    );
    const stageIndex = 1;
    const findColumn = columnFinder(
      initialQuery,
      Lib.fieldableColumns(initialQuery, stageIndex),
    );
    setup({
      query: Lib.filter(
        initialQuery,
        stageIndex,
        Lib.numberFilterClause({
          operator: "=",
          column: findColumn("PRODUCTS", "PRICE"),
          values: [1],
        }),
      ),
    });

    const [group, firstColumn, secondColumn] = screen.getAllByRole("checkbox");
    expect(group).toBeChecked();
    expect(group).toBeEnabled();

    // remove all columns - the first column is not removed
    await userEvent.click(group);
    expect(group).not.toBeChecked();
    expect(group).toBeEnabled();
    expect(firstColumn).toBeChecked();
    expect(firstColumn).toBeDisabled();
    expect(secondColumn).not.toBeChecked();
    expect(secondColumn).toBeEnabled();

    // add all columns
    await userEvent.click(group);
    expect(group).toBeChecked();
    expect(group).toBeEnabled();
    expect(firstColumn).toBeChecked();
    expect(firstColumn).toBeEnabled();
    expect(secondColumn).toBeChecked();
    expect(secondColumn).toBeEnabled();

    // remove the first column - the second column is disabled
    await userEvent.click(firstColumn);
    expect(group).not.toBeChecked();
    expect(group).toBeEnabled();
    expect(firstColumn).not.toBeChecked();
    expect(firstColumn).toBeEnabled();
    expect(secondColumn).toBeChecked();
    expect(secondColumn).toBeDisabled();

    // add the first column
    await userEvent.click(firstColumn);
    expect(group).toBeChecked();
    expect(group).toBeEnabled();
    expect(firstColumn).toBeChecked();
    expect(firstColumn).toBeEnabled();
    expect(secondColumn).toBeChecked();
    expect(secondColumn).toBeEnabled();

    // remove the second column - the first column is disabled
    await userEvent.click(secondColumn);
    expect(group).not.toBeChecked();
    expect(group).toBeEnabled();
    expect(firstColumn).toBeChecked();
    expect(firstColumn).toBeDisabled();
    expect(secondColumn).not.toBeChecked();
    expect(secondColumn).toBeEnabled();

    // add the second column
    await userEvent.click(secondColumn);
    expect(group).toBeChecked();
    expect(group).toBeEnabled();
    expect(firstColumn).toBeChecked();
    expect(firstColumn).toBeEnabled();
    expect(secondColumn).toBeChecked();
    expect(secondColumn).toBeEnabled();
  });

  it("should not allow to remove custom columns", async () => {
    const query = Lib.expression(
      createQuery(),
      -1,
      "Custom",
      Lib.expressionClause("+", [1, 2]),
    );
    setup({ query });
    const [orderGroup, firstColumn] = screen.getAllByRole("checkbox");
    const customColumn = screen.getByRole("checkbox", { name: "Custom" });
    expect(orderGroup).toBeChecked();
    expect(orderGroup).toBeEnabled();
    expect(firstColumn).toBeChecked();
    expect(firstColumn).toBeEnabled();
    expect(customColumn).toBeChecked();
    expect(customColumn).toBeDisabled();

    await userEvent.click(orderGroup);
    expect(orderGroup).not.toBeChecked();
    expect(orderGroup).toBeEnabled();
    expect(firstColumn).toBeChecked();
    expect(firstColumn).toBeDisabled();
    expect(customColumn).toBeChecked();
    expect(customColumn).toBeDisabled();
  });

  it("should not allow to remove columns when there are expressions and only one removable column in multi-stage queries", () => {
    const initialQuery = Lib.appendStage(
      createQueryWithClauses({
        query: createQuery(),
        breakouts: [{ tableName: "PRODUCTS", columnName: "PRICE" }],
      }),
    );
    const stageIndex = 1;
    setup({
      query: Lib.expression(
        initialQuery,
        stageIndex,
        "Custom",
        Lib.expressionClause("+", [1, 2]),
      ),
    });

    const [group, ...columns] = screen.getAllByRole("checkbox");
    expect(group).toBeChecked();
    expect(group).toBeDisabled();
    expect(columns.length).toBe(2);
    for (const column of columns) {
      expect(column).toBeChecked();
      expect(column).toBeDisabled();
    }
  });

  it("should allow to search for columns", async () => {
    setup();
    await userEvent.type(
      screen.getByPlaceholderText("Search for a column…"),
      "a",
    );

    const taxColumn = screen.getByRole("checkbox", { name: "Tax" });
    const categoryColumn = screen.getByRole("checkbox", { name: "Category" });
    const vendorColumn = screen.queryByRole("checkbox", { name: "Vendor" });
    expect(taxColumn).toBeInTheDocument();
    expect(categoryColumn).toBeInTheDocument();
    expect(vendorColumn).not.toBeInTheDocument();

    await userEvent.click(categoryColumn);
    expect(categoryColumn).toBeChecked();
  });
});
