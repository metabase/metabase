import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  SAMPLE_DATABASE,
  SAMPLE_PROVIDER,
  createQuery,
  createTestQuery,
} from "metabase-lib/test-helpers";
import { ORDERS_ID, PRODUCTS_ID } from "metabase-types/api/mocks/presets";

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
      query: createTestQuery(SAMPLE_PROVIDER, {
        databaseId: SAMPLE_DATABASE.id,
        stages: [
          {
            source: {
              type: "table",
              id: ORDERS_ID,
            },
            aggregations: [
              { type: "operator", operator: "count", args: [] },
              {
                type: "operator",
                operator: "sum",
                args: [
                  {
                    type: "column",
                    name: "PRICE",
                    groupName: "Product",
                  },
                ],
              },
            ],
          },
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
      query: createTestQuery(SAMPLE_PROVIDER, {
        databaseId: SAMPLE_DATABASE.id,
        stages: [
          {
            source: {
              type: "table",
              id: ORDERS_ID,
            },
            breakouts: [
              {
                name: "PRICE",
                groupName: "Product",
              },
            ],
          },
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

  it("should not allow to remove the only field from multi-stage queries", () => {
    setup({
      query: createTestQuery(SAMPLE_PROVIDER, {
        databaseId: SAMPLE_DATABASE.id,
        stages: [
          {
            source: {
              type: "table",
              id: ORDERS_ID,
            },
            breakouts: [
              {
                name: "PRICE",
                groupName: "Product",
              },
            ],
          },
          {
            filters: [
              {
                type: "operator",
                operator: "=",
                args: [
                  {
                    type: "column",
                    name: "PRICE",
                    groupName: "Summaries",
                  },
                  { type: "literal", value: 1 },
                ],
              },
            ],
          },
        ],
      }),
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
    setup({
      query: createTestQuery(SAMPLE_PROVIDER, {
        databaseId: SAMPLE_DATABASE.id,
        stages: [
          {
            source: {
              type: "table",
              id: ORDERS_ID,
            },
            breakouts: [
              {
                name: "PRICE",
                groupName: "Product",
              },
              {
                name: "CREATED_AT",
                groupName: "Product",
              },
            ],
          },
          {
            filters: [
              {
                type: "operator",
                operator: "=",
                args: [
                  {
                    type: "column",
                    name: "PRICE",
                    groupName: "Summaries",
                  },
                  { type: "literal", value: 1 },
                ],
              },
            ],
          },
        ],
      }),
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
    setup({
      query: createTestQuery(SAMPLE_PROVIDER, {
        databaseId: SAMPLE_DATABASE.id,
        stages: [
          {
            source: {
              type: "table",
              id: ORDERS_ID,
            },
            breakouts: [
              {
                name: "PRICE",
                groupName: "Product",
              },
            ],
          },
          {
            expressions: [
              {
                name: "Custom",
                value: {
                  type: "operator",
                  operator: "+",
                  args: [
                    { type: "literal", value: 1 },
                    { type: "literal", value: 2 },
                  ],
                },
              },
            ],
            filters: [
              {
                type: "operator",
                operator: "=",
                args: [
                  {
                    type: "column",
                    name: "PRICE",
                    groupName: "Summaries",
                  },
                  { type: "literal", value: 1 },
                ],
              },
            ],
          },
        ],
      }),
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

  it("should add/remove all even when there is a search", async () => {
    setup();

    // search so we only see Orders columns
    await userEvent.type(
      screen.getByPlaceholderText("Search for a column…"),
      "tal", // subtotal and total -> Orders only
    );

    // check that we only see the "Orders" group
    expect(
      screen.queryByRole("list", { name: "User" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Products" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Orders" })).toBeInTheDocument();

    // check that subtotal is there and checked
    const subtotalColumn = screen.getByRole("checkbox", { name: "Subtotal" });
    expect(subtotalColumn).toBeInTheDocument();
    expect(subtotalColumn).toBeChecked();

    // check that total is there and checked
    const totalColumn = screen.getByRole("checkbox", { name: "Total" });
    expect(totalColumn).toBeInTheDocument();
    expect(totalColumn).toBeChecked();

    // check that we have 3 checkboxes (Orders, Subtotal, Total)
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBe(3);

    // Get the "Remove all" checkbox for Orders group, which should be checked
    // and click it to remove all columns in Orders group
    const removeAll = screen.getByRole("checkbox", { name: "Orders" });
    expect(removeAll).toBeInTheDocument();
    expect(removeAll).toBeChecked();
    await userEvent.click(removeAll);

    // check that all visible columns are unchecked
    expect(subtotalColumn).not.toBeChecked();
    expect(totalColumn).not.toBeChecked();
  });
});
