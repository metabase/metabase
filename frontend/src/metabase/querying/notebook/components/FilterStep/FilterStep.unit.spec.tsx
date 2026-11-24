import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { TableId, TestNamedExpressionSpec } from "metabase-types/api";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { createMockNotebookStep } from "../../test-utils";

import { FilterStep } from "./FilterStep";

function createQueryWithFilter() {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        filters: [
          {
            type: "operator",
            operator: ">",
            args: [
              { type: "column", name: "TOTAL" },
              { type: "literal", value: 20 },
            ],
          },
        ],
      },
    ],
  });

  const [filter] = Lib.filters(query, 0);
  return { query, filter };
}

function createQueryWithExpression(
  tableId: TableId,
  expression?: TestNamedExpressionSpec,
) {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: tableId },
        expressions: expression ? [expression] : [],
      },
    ],
  });
}

function setup(step = createMockNotebookStep()) {
  const updateQuery = jest.fn();

  renderWithProviders(
    <FilterStep
      step={step}
      stageIndex={step.stageIndex}
      query={step.query}
      color="core-filter"
      isLastOpened={false}
      reportTimezone="UTC"
      updateQuery={updateQuery}
    />,
  );
}

interface SetupWithQueryUpdatesOpts {
  query: Lib.Query;
}

function setupWithQueryUpdates({ query }: SetupWithQueryUpdatesOpts) {
  const onQueryChange = jest.fn<void, [Lib.Query]>();

  setupDatabaseEndpoints(createSampleDatabase());

  function FilterStepWithQueryUpdates() {
    const [currentQuery, setCurrentQuery] = useState(query);
    const step = createMockNotebookStep({
      type: "filter",
      query: currentQuery,
    });

    const handleUpdateQuery = async (nextQuery: Lib.Query) => {
      setCurrentQuery(nextQuery);
      onQueryChange(nextQuery);
    };

    return (
      <FilterStep
        step={step}
        stageIndex={step.stageIndex}
        query={step.query}
        color="core-filter"
        isLastOpened={false}
        reportTimezone="UTC"
        updateQuery={handleUpdateQuery}
      />
    );
  }

  renderWithProviders(<FilterStepWithQueryUpdates />);

  function getRecentQuery(): Lib.Query {
    expect(onQueryChange).toHaveBeenCalled();
    const [recentQuery] = checkNotNull(onQueryChange.mock.lastCall);
    return recentQuery;
  }

  function getRecentFilter(): Lib.FilterClause {
    const filters = Lib.filters(getRecentQuery(), 0);
    expect(filters).toHaveLength(1);
    return filters[0];
  }

  function getRecentFilterName(): string {
    return Lib.displayInfo(getRecentQuery(), 0, getRecentFilter()).displayName;
  }

  return { getRecentQuery, getRecentFilter, getRecentFilterName };
}

async function typeExpressionAndSubmit(formula: string, buttonName: RegExp) {
  const input = await screen.findByTestId("custom-expression-query-editor");
  await waitFor(() => expect(input).toHaveProperty("readOnly", false));
  await userEvent.clear(input);
  await userEvent.type(input, formula);
  await userEvent.tab();

  const button = screen.getByRole("button", { name: buttonName });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
}

describe("FilterStep", () => {
  it("should render without filters", () => {
    setup();
    expect(
      screen.getByText("Add filters to narrow your answer"),
    ).toBeInTheDocument();
  });

  it("should render filters", () => {
    const { query } = createQueryWithFilter();
    setup(createMockNotebookStep({ query }));
    expect(screen.getByText("Total is greater than 20")).toBeInTheDocument();
  });

  describe("custom columns", () => {
    it("should add a date range filter to a custom column", async () => {
      const { getRecentQuery, getRecentFilter } = setupWithQueryUpdates({
        query: createQueryWithExpression(ORDERS_ID, {
          name: "CustomDate",
          value: { type: "column", fieldId: ORDERS.CREATED_AT },
        }),
      });

      await userEvent.click(
        screen.getByText("Add filters to narrow your answer"),
      );
      await userEvent.click(await screen.findByText("CustomDate"));
      await userEvent.click(await screen.findByText("Fixed date range…"));
      const startDateInput = await screen.findByLabelText("Start date");
      await userEvent.clear(startDateInput);
      await userEvent.type(startDateInput, "12/10/2027");
      const endDateInput = screen.getByLabelText("End date");
      await userEvent.clear(endDateInput);
      await userEvent.type(endDateInput, "01/05/2028");
      await userEvent.click(screen.getByRole("button", { name: "Add filter" }));

      expect(
        await screen.findByText("CustomDate is Dec 10, 2027 – Jan 5, 2028"),
      ).toBeInTheDocument();
      const filterParts = checkNotNull(
        Lib.specificDateFilterParts(getRecentQuery(), 0, getRecentFilter()),
      );
      expect(filterParts).toMatchObject({
        operator: "between",
        values: [new Date(2027, 11, 10), new Date(2028, 0, 5)],
        hasTime: false,
      });
      expect(
        Lib.displayInfo(getRecentQuery(), 0, filterParts.column).displayName,
      ).toBe("CustomDate");
    });

    it("should add a relative date filter with the current period to a custom column (metabase#16273)", async () => {
      const { getRecentQuery, getRecentFilter } = setupWithQueryUpdates({
        query: createQueryWithExpression(ORDERS_ID, {
          name: "MiscDate",
          value: {
            type: "operator",
            operator: "case",
            args: [
              {
                type: "operator",
                operator: ">",
                args: [
                  { type: "column", name: "DISCOUNT" },
                  { type: "literal", value: 0 },
                ],
              },
              { type: "column", name: "CREATED_AT" },
              {
                type: "column",
                name: "CREATED_AT",
                sourceFieldId: ORDERS.PRODUCT_ID,
              },
            ],
          },
        }),
      });

      await userEvent.click(
        screen.getByText("Add filters to narrow your answer"),
      );
      await userEvent.click(await screen.findByText("MiscDate"));
      await userEvent.click(await screen.findByText("Relative date range…"));
      await userEvent.click(screen.getByText("Previous"));
      await userEvent.click(screen.getByDisplayValue("days"));
      await userEvent.click(
        within(await screen.findByRole("listbox")).getByText("years"),
      );
      await userEvent.click(screen.getByLabelText("Include this year"));
      await userEvent.click(screen.getByRole("button", { name: "Add filter" }));

      expect(
        await screen.findByText(
          "MiscDate is in the previous 30 years or this year",
        ),
      ).toBeInTheDocument();
      expect(
        Lib.relativeDateFilterParts(getRecentQuery(), 0, getRecentFilter()),
      ).toMatchObject({
        value: -30,
        unit: "year",
        options: { includeCurrent: true },
      });
    });

    it("should filter a custom column that uses the `if` function", async () => {
      const { getRecentQuery, getRecentFilter } = setupWithQueryUpdates({
        query: createQueryWithExpression(PRODUCTS_ID, {
          name: "If",
          value: {
            type: "operator",
            operator: "if",
            args: [
              {
                type: "operator",
                operator: "=",
                args: [
                  { type: "column", name: "ID" },
                  { type: "literal", value: 1 },
                ],
              },
              { type: "literal", value: "First" },
              {
                type: "operator",
                operator: "=",
                args: [
                  { type: "column", name: "ID" },
                  { type: "literal", value: 2 },
                ],
              },
              { type: "literal", value: "Second" },
              { type: "literal", value: "Other" },
            ],
          },
        }),
      });

      await userEvent.click(
        screen.getByText("Add filters to narrow your answer"),
      );
      await userEvent.click(await screen.findByText("If"));
      await userEvent.click(await screen.findByLabelText("Filter operator"));
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Is" }),
      );
      await userEvent.type(
        screen.getByPlaceholderText("Enter some text"),
        "Other",
      );
      await userEvent.click(screen.getByRole("button", { name: "Add filter" }));

      expect(await screen.findByText("If is Other")).toBeInTheDocument();
      expect(
        Lib.stringFilterParts(getRecentQuery(), 0, getRecentFilter()),
      ).toMatchObject({ operator: "=", values: ["Other"] });
    });

    it("should add a custom expression filter that uses the `if` function", async () => {
      const { getRecentFilterName } = setupWithQueryUpdates({
        query: createQueryWithExpression(PRODUCTS_ID),
      });

      await userEvent.click(
        screen.getByText("Add filters to narrow your answer"),
      );
      await userEvent.click(await screen.findByText(/Custom expression/i));
      await typeExpressionAndSubmit(
        'if([[Category] = "Gadget", 1, [[Category] = "Widget", 2) = 2',
        /Done/,
      );

      expect(await screen.findByText("If is equal to 2")).toBeInTheDocument();
      expect(getRecentFilterName()).toBe("If is equal to 2");
    });

    it("should filter a boolean custom column that uses the `in` function", async () => {
      const { getRecentQuery, getRecentFilter } = setupWithQueryUpdates({
        query: createQueryWithExpression(PRODUCTS_ID, {
          name: "InColumn",
          value: {
            type: "operator",
            operator: "in",
            args: [
              { type: "literal", value: "Gadget" },
              { type: "column", name: "VENDOR" },
              { type: "column", name: "CATEGORY" },
            ],
          },
        }),
      });

      await userEvent.click(
        screen.getByText("Add filters to narrow your answer"),
      );
      await userEvent.click(await screen.findByText("InColumn"));
      expect(
        await screen.findByTestId("boolean-filter-picker"),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Add filter" }));

      expect(await screen.findByText("InColumn is true")).toBeInTheDocument();
      const filterParts = checkNotNull(
        Lib.booleanFilterParts(getRecentQuery(), 0, getRecentFilter()),
      );
      expect(filterParts.operator).toBe("=");
      expect(filterParts.values).toEqual([true]);
      expect(
        Lib.displayInfo(getRecentQuery(), 0, filterParts.column).displayName,
      ).toBe("InColumn");
    });

    it("should handle `in` and `notIn` custom expression filters", async () => {
      const { getRecentQuery, getRecentFilter } = setupWithQueryUpdates({
        query: createQueryWithExpression(PRODUCTS_ID),
      });

      await userEvent.click(
        screen.getByText("Add filters to narrow your answer"),
      );
      await userEvent.click(await screen.findByText(/Custom expression/i));
      await typeExpressionAndSubmit("in([[ID], 1, 2, 3)", /Done/);

      expect(await screen.findByText("ID is 3 selections")).toBeInTheDocument();
      expect(
        Lib.numberFilterParts(getRecentQuery(), 0, getRecentFilter()),
      ).toMatchObject({ operator: "=", values: [1, 2, 3] });

      await userEvent.click(screen.getByText("ID is 3 selections"));
      const picker = await screen.findByTestId("number-filter-picker");
      expect(within(picker).getByText("3")).toBeInTheDocument();
      await userEvent.type(
        within(picker).getByRole("combobox", { name: "Filter value" }),
        "{backspace}",
      );
      expect(within(picker).queryByText("3")).not.toBeInTheDocument();
      expect(within(picker).getByText("1")).toBeInTheDocument();
      expect(within(picker).getByText("2")).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", { name: "Update filter" }),
      );

      expect(await screen.findByText("ID is 2 selections")).toBeInTheDocument();
      const updatedFilterParts = checkNotNull(
        Lib.numberFilterParts(getRecentQuery(), 0, getRecentFilter()),
      );
      expect(updatedFilterParts.operator).toBe("=");
      expect(updatedFilterParts.values).toEqual([1, 2]);

      await userEvent.click(screen.getByText("ID is 2 selections"));
      await userEvent.click(await screen.findByLabelText("Back"));
      await userEvent.click(await screen.findByText(/Custom expression/i));
      await typeExpressionAndSubmit("notIn([[ID], 1, 2, 3)", /Update/);

      expect(
        await screen.findByText("ID is not 3 selections"),
      ).toBeInTheDocument();
      expect(
        Lib.numberFilterParts(getRecentQuery(), 0, getRecentFilter()),
      ).toMatchObject({ operator: "!=", values: [1, 2, 3] });
    });
  });
});
