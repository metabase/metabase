import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { setupFieldsValuesEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  columnFinder,
  createQuery,
  createQueryWithClauses,
} from "metabase-lib/test-helpers";
import { createMockField } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS_ID,
  SAMPLE_DB_FIELD_VALUES,
} from "metabase-types/api/mocks/presets";

import { FilterModal } from "./FilterModal";

interface SetupOpts {
  query: Lib.Query;
}

function setup({ query }: SetupOpts) {
  const onSubmit = jest.fn();
  const onClose = jest.fn();

  setupFieldsValuesEndpoints(SAMPLE_DB_FIELD_VALUES);

  renderWithProviders(
    <FilterModal query={query} onSubmit={onSubmit} onClose={onClose} />,
  );

  const getNextQuery = () => {
    const [nextQuery] = onSubmit.mock.lastCall;
    return nextQuery;
  };

  return { getNextQuery };
}

describe("FilterModal", () => {
  const query = createQuery();
  const stageIndex = 0;
  const findColumn = columnFinder(
    query,
    Lib.filterableColumns(query, stageIndex),
  );

  it("should allow to add filters", async () => {
    const { getNextQuery } = setup({ query });

    const totalSection = screen.getByTestId("filter-column-Total");
    await userEvent.type(
      within(totalSection).getByPlaceholderText("Min"),
      "10",
    );
    await userEvent.type(
      within(totalSection).getByPlaceholderText("Max"),
      "20",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Apply filters" }),
    );

    const nextQuery = getNextQuery();
    expect(Lib.stageCount(nextQuery)).toBe(1);
    expect(Lib.filters(nextQuery, 0)).toHaveLength(1);
  });

  it("should allow to add filters for implicitly joined tables", async () => {
    const { getNextQuery } = setup({ query });

    await userEvent.click(screen.getByRole("tab", { name: "Product" }));
    await waitForLoaderToBeRemoved();
    const priceSection = screen.getByTestId("filter-column-Price");
    await userEvent.type(
      within(priceSection).getByPlaceholderText("Min"),
      "10",
    );
    await userEvent.type(
      within(priceSection).getByPlaceholderText("Max"),
      "20",
    );

    await userEvent.click(screen.getByRole("tab", { name: "User" }));
    await waitForLoaderToBeRemoved();
    const sourceSection = screen.getByTestId("filter-column-Source");
    await userEvent.click(within(sourceSection).getByText("Organic"));

    await userEvent.click(
      screen.getByRole("button", { name: "Apply filters" }),
    );

    const nextQuery = getNextQuery();
    expect(Lib.stageCount(nextQuery)).toBe(1);
    expect(Lib.filters(nextQuery, 0)).toHaveLength(2);
  });

  it("should allow to add filters for unknown column types", async () => {
    const unknownField = createMockField({
      id: 100,
      table_id: ORDERS_ID,
      name: "UNKNOWN",
      display_name: "Unknown",
      base_type: "type/*",
      effective_type: "type/*",
      semantic_type: null,
    });
    const metadata = createMockMetadata({
      databases: [createSampleDatabase()],
      fields: [unknownField],
    });
    const { getNextQuery } = setup({ query: createQuery({ metadata }) });

    const columnSection = screen.getByTestId(`filter-column-Unknown`);
    await userEvent.click(within(columnSection).getByLabelText("Is empty"));
    await userEvent.click(
      screen.getByRole("button", { name: "Apply filters" }),
    );

    const nextQuery = getNextQuery();
    expect(Lib.stageCount(nextQuery)).toBe(1);
    expect(Lib.filters(nextQuery, 0)).toHaveLength(1);
  });

  it("should allow to add post-aggregation filters", async () => {
    const { getNextQuery } = setup({
      query: createQueryWithClauses({
        aggregations: [{ operatorName: "count" }],
        breakouts: [{ tableName: "ORDERS", columnName: "CREATED_AT" }],
      }),
    });

    await userEvent.click(screen.getByRole("tab", { name: "Summaries" }));

    const countSection = screen.getByTestId("filter-column-Count");
    await userEvent.type(
      within(countSection).getByPlaceholderText("Min"),
      "10",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Apply filters" }),
    );

    const nextQuery = getNextQuery();
    expect(Lib.stageCount(nextQuery)).toBe(2);
    expect(Lib.filters(nextQuery, 0)).toHaveLength(0);
    expect(Lib.filters(nextQuery, 1)).toHaveLength(1);
  });

  it("should allow to search for columns and add filters", async () => {
    const { getNextQuery } = setup({ query });

    const searchInput = screen.getByPlaceholderText("Search for a column…");
    await userEvent.type(searchInput, "created");
    await waitFor(() => {
      expect(screen.getAllByTestId("filter-column-Created At")).toHaveLength(3);
    });

    const sections = screen.getAllByTestId("filter-column-Created At");
    const [ordersSection, productsSection, peopleSection] = sections;
    expect(within(ordersSection).getByText("Orders")).toBeInTheDocument();
    expect(within(productsSection).getByText("Products")).toBeInTheDocument();
    expect(within(peopleSection).getByText("People")).toBeInTheDocument();

    await userEvent.click(within(ordersSection).getByText("Today"));
    await userEvent.click(within(productsSection).getByText("Yesterday"));
    await userEvent.click(within(peopleSection).getByText("Last month"));
    await userEvent.click(
      screen.getByRole("button", { name: "Apply filters" }),
    );

    const nextQuery = getNextQuery();
    expect(Lib.stageCount(nextQuery)).toBe(1);
    expect(Lib.filters(nextQuery, 0)).toHaveLength(3);
  });

  it("should update existing filters", async () => {
    const { getNextQuery } = setup({
      query: Lib.filter(
        query,
        stageIndex,
        Lib.stringFilterClause({
          operator: "=",
          column: findColumn("PRODUCTS", "CATEGORY"),
          values: ["Gadget"],
          options: {},
        }),
      ),
    });

    await userEvent.click(screen.getByRole("tab", { name: "Product" }));
    await waitForLoaderToBeRemoved();
    expect(screen.getByRole("checkbox", { name: "Gadget" })).toBeChecked();

    await userEvent.click(screen.getByRole("checkbox", { name: "Widget" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Apply filters" }),
    );
    const nextQuery = getNextQuery();
    expect(Lib.stageCount(nextQuery)).toBe(1);
    expect(Lib.filters(nextQuery, 0)).toHaveLength(1);
  });

  it("should remove existing filters", async () => {
    const { getNextQuery } = setup({
      query: Lib.filter(
        query,
        stageIndex,
        Lib.stringFilterClause({
          operator: "=",
          column: findColumn("PRODUCTS", "CATEGORY"),
          values: ["Gadget"],
          options: {},
        }),
      ),
    });

    await userEvent.click(screen.getByRole("tab", { name: "Product" }));
    await waitForLoaderToBeRemoved();
    expect(screen.getByRole("checkbox", { name: "Gadget" })).toBeChecked();

    await userEvent.click(screen.getByRole("checkbox", { name: "Gadget" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Apply filters" }),
    );
    const nextQuery = getNextQuery();
    expect(Lib.stageCount(nextQuery)).toBe(1);
    expect(Lib.filters(nextQuery, 0)).toHaveLength(0);
  });

  it("should order columns by type", () => {
    setup({ query });

    const sections = screen.getAllByTestId(/filter-column/);
    const columns = [
      "Created At",
      "Discount",
      "Quantity",
      "Subtotal",
      "Tax",
      "Total",
      "ID",
      "Product ID",
      "User ID",
    ];

    expect(sections).toHaveLength(columns.length);
    sections.forEach((section, sectionIndex) => {
      expect(
        within(section).getByText(columns[sectionIndex]),
      ).toBeInTheDocument();
    });
  });

  it("should have info icons", () => {
    setup({ query });
    expect(screen.getAllByLabelText("More info").length).toBeGreaterThanOrEqual(
      1,
    );
  });
});
