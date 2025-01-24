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
  SAMPLE_METADATA,
  columnFinder,
  createQuery,
  createQueryWithClauses,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import {
  createMockCard,
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_FIELD_VALUES,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { FilterModal } from "./FilterModal";

interface SetupOpts {
  query: Lib.Query;
  metadata?: Metadata;
}

function setup({ query, metadata = SAMPLE_METADATA }: SetupOpts) {
  const onSubmit = jest.fn();
  const onClose = jest.fn();
  const question = new Question(createMockCard(), metadata).setQuery(query);

  setupFieldsValuesEndpoints(SAMPLE_DB_FIELD_VALUES);

  renderWithProviders(
    <FilterModal question={question} onSubmit={onSubmit} onClose={onClose} />,
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
    const { getNextQuery } = setup({
      query: createQuery({ metadata }),
      metadata,
    });

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
    await userEvent.click(within(peopleSection).getByText("Previous month"));
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

describe("FilterModal - issue 48319", () => {
  const query = createQuery();

  // TODO: assert options (how?)
  it("string filters - does not mix up column filter state when changing search query (metabase#48319)", async () => {
    setup({ query });

    const searchInput = screen.getByPlaceholderText("Search for a column…");
    await userEvent.type(searchInput, "category");
    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", { name: "Doohickey" }),
      ).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("checkbox", { name: "Doohickey" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Filter operator" }),
    );
    await userEvent.click(screen.getByText("Is not"));

    await userEvent.type(
      searchInput,
      `${"{backspace}".repeat("category".length)}source`,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", { name: "Affiliate" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "Filter operator" }),
    ).toHaveTextContent("is");
    expect(
      screen.queryByRole("checkbox", { name: "Doohickey" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: "Affiliate" }));
    await userEvent.type(
      searchInput,
      `${"{backspace}".repeat("source".length)}category`,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", { name: "Doohickey" }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("checkbox", { name: "Doohickey" })).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Filter operator" }),
    ).toHaveTextContent("is not");
    expect(
      screen.queryByRole("checkbox", { name: "Affiliate" }),
    ).not.toBeInTheDocument();
  });

  it("boolean filters - does not mix up column filter state when changing search query (metabase#48319)", async () => {
    const ACCOUNTS_ID = 4;
    const ACCOUNTS_TRIAL_CONVERTED_ID = 56;
    const ACCOUNTS_ACTIVE_SUBSCRIPTION_ID = 57;

    const database = createMockDatabase({
      id: SAMPLE_DB_ID,
      name: "Sample Database",
      tables: [
        createMockTable({
          id: ACCOUNTS_ID,
          db_id: SAMPLE_DB_ID,
          name: "ACCOUNTS",
          display_name: "Accounts",
          schema: "PUBLIC",
          fields: [
            createMockField({
              id: ACCOUNTS_TRIAL_CONVERTED_ID,
              table_id: ACCOUNTS_ID,
              name: "TRIAL_CONVERTED",
              display_name: "Trial Converted",
              base_type: "type/Boolean",
              effective_type: "type/Boolean",
              semantic_type: "type/Category",
            }),
            createMockField({
              id: ACCOUNTS_ACTIVE_SUBSCRIPTION_ID,
              table_id: ACCOUNTS_ID,
              name: "ACTIVE_SUBSCRIPTION",
              display_name: "Active Subscription",
              base_type: "type/Boolean",
              effective_type: "type/Boolean",
              semantic_type: "type/Category",
            }),
          ],
        }),
      ],
      is_sample: true,
    });

    const metadata = createMockMetadata({
      databases: [database],
    });

    setup({
      query: createQuery({
        query: {
          database: database.id,
          type: "query",
          query: {
            "source-table": ACCOUNTS_ID,
          },
        },
      }),
      metadata,
    });

    const searchInput = screen.getByPlaceholderText("Search for a column…");

    await userEvent.type(searchInput, "trial");
    await waitFor(() => {
      expect(screen.queryByText("Active Subscription")).not.toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("checkbox", { name: "True" }));

    await userEvent.type(
      searchInput,
      `${"{backspace}".repeat("trial".length)}active`,
    );
    await waitFor(() => {
      expect(screen.getByText("Active Subscription")).toBeInTheDocument();
    });
    expect(screen.queryByRole("checkbox", { name: "True" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "False" }));

    await userEvent.type(
      searchInput,
      `${"{backspace}".repeat("active".length)}trial`,
    );
    await waitFor(() => {
      expect(screen.getByText("Trial Converted")).toBeInTheDocument();
    });
    expect(screen.getByRole("checkbox", { name: "True" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "False" })).not.toBeChecked();
  });

  it("time filters - does not mix up column filter state when changing search query (metabase#48319)", async () => {
    const ACCOUNTS_ID = 4;
    const ACCOUNTS_TRIAL_CONVERTED_ID = 56;
    const ACCOUNTS_ACTIVE_SUBSCRIPTION_ID = 57;

    const database = createMockDatabase({
      id: SAMPLE_DB_ID,
      name: "Sample Database",
      tables: [
        createMockTable({
          id: ACCOUNTS_ID,
          db_id: SAMPLE_DB_ID,
          name: "ACCOUNTS",
          display_name: "Accounts",
          schema: "PUBLIC",
          fields: [
            createMockField({
              id: ACCOUNTS_TRIAL_CONVERTED_ID,
              table_id: ACCOUNTS_ID,
              name: "TRIAL_CONVERTED",
              display_name: "Trial Converted",
              base_type: "type/Time",
              effective_type: "type/Time",
            }),
            createMockField({
              id: ACCOUNTS_ACTIVE_SUBSCRIPTION_ID,
              table_id: ACCOUNTS_ID,
              name: "ACTIVE_SUBSCRIPTION",
              display_name: "Active Subscription",
              base_type: "type/Time",
              effective_type: "type/Time",
            }),
          ],
        }),
      ],
      is_sample: true,
    });

    const metadata = createMockMetadata({
      databases: [database],
    });

    setup({
      query: createQuery({
        query: {
          database: database.id,
          type: "query",
          query: {
            "source-table": ACCOUNTS_ID,
          },
        },
      }),
      metadata,
    });

    const searchInput = screen.getByPlaceholderText("Search for a column…");

    await userEvent.type(searchInput, "trial");
    await waitFor(() => {
      expect(screen.queryByText("Active Subscription")).not.toBeInTheDocument();
    });
    await userEvent.clear(screen.getByPlaceholderText("Enter a time"));
    await userEvent.type(
      screen.getByPlaceholderText("Enter a time"),
      `${"{backspace}".repeat("00:00".length)}12:34`,
    );

    await userEvent.type(
      searchInput,
      `${"{backspace}".repeat("trial".length)}active`,
    );
    await waitFor(() => {
      expect(screen.getByText("Active Subscription")).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText("Enter a time")).toHaveValue("00:00");
    await userEvent.type(
      screen.getByPlaceholderText("Enter a time"),
      `${"{backspace}".repeat("12:34".length)}21:43`,
    );

    await userEvent.type(
      searchInput,
      `${"{backspace}".repeat("active".length)}trial`,
    );
    await waitFor(() => {
      expect(screen.getByText("Trial Converted")).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText("Enter a time")).toHaveValue("12:34");
  });
});
