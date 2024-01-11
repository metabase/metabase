import userEvent from "@testing-library/user-event";
import {
  act,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { setupFieldsValuesEndpoints } from "__support__/server-mocks";
import { SAMPLE_DB_FIELD_VALUES } from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import {
  columnFinder,
  createQuery,
  createQueryWithClauses,
} from "metabase-lib/test-helpers";
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

  beforeAll(() => {
    jest.useFakeTimers({ advanceTimers: true });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("should allow to add filters", async () => {
    const { getNextQuery } = setup({ query });

    const totalSection = screen.getByTestId("filter-column-Total");
    userEvent.type(within(totalSection).getByPlaceholderText("Min"), "10");
    userEvent.type(within(totalSection).getByPlaceholderText("Max"), "20");
    userEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    const nextQuery = getNextQuery();
    expect(Lib.stageCount(nextQuery)).toBe(1);
    expect(Lib.filters(nextQuery, 0)).toHaveLength(1);
  });

  it("should allow to add filters for implicitly joined tables", async () => {
    const { getNextQuery } = setup({ query });

    userEvent.click(screen.getByRole("tab", { name: "Product" }));
    await waitForLoaderToBeRemoved();
    const priceSection = screen.getByTestId("filter-column-Price");
    userEvent.type(within(priceSection).getByPlaceholderText("Min"), "10");
    userEvent.type(within(priceSection).getByPlaceholderText("Max"), "20");

    userEvent.click(screen.getByRole("tab", { name: "User" }));
    await waitForLoaderToBeRemoved();
    const sourceSection = screen.getByTestId("filter-column-Source");
    userEvent.click(within(sourceSection).getByText("Organic"));

    userEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    const nextQuery = getNextQuery();
    expect(Lib.stageCount(nextQuery)).toBe(1);
    expect(Lib.filters(nextQuery, 0)).toHaveLength(2);
  });

  it("should allow to add post-aggregation filters", () => {
    const { getNextQuery } = setup({
      query: createQueryWithClauses({
        aggregations: [{ operatorName: "count" }],
        breakouts: [{ tableName: "ORDERS", columnName: "CREATED_AT" }],
      }),
    });

    userEvent.click(screen.getByRole("tab", { name: "Summaries" }));

    const countSection = screen.getByTestId("filter-column-Count");
    userEvent.type(within(countSection).getByPlaceholderText("Min"), "10");
    userEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    const nextQuery = getNextQuery();
    expect(Lib.stageCount(nextQuery)).toBe(2);
    expect(Lib.filters(nextQuery, 0)).toHaveLength(0);
    expect(Lib.filters(nextQuery, 1)).toHaveLength(1);
  });

  it("should allow to search for columns and add filters", () => {
    const { getNextQuery } = setup({ query });

    const searchInput = screen.getByPlaceholderText("Search for a column…");
    userEvent.type(searchInput, "created");
    act(() => jest.advanceTimersByTime(1000));
    const sections = screen.getAllByTestId("filter-column-Created At");
    expect(sections).toHaveLength(3);

    const [ordersSection, productsSection, peopleSection] = sections;
    expect(within(ordersSection).getByText("Orders")).toBeInTheDocument();
    expect(within(productsSection).getByText("Products")).toBeInTheDocument();
    expect(within(peopleSection).getByText("People")).toBeInTheDocument();

    userEvent.click(within(ordersSection).getByText("Today"));
    userEvent.click(within(productsSection).getByText("Yesterday"));
    userEvent.click(within(peopleSection).getByText("Last month"));
    userEvent.click(screen.getByRole("button", { name: "Apply filters" }));

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

    userEvent.click(screen.getByRole("tab", { name: "Product" }));
    await waitForLoaderToBeRemoved();
    expect(screen.getByRole("checkbox", { name: "Gadget" })).toBeChecked();

    userEvent.click(screen.getByRole("checkbox", { name: "Widget" }));
    userEvent.click(screen.getByRole("button", { name: "Apply filters" }));
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

    userEvent.click(screen.getByRole("tab", { name: "Product" }));
    await waitForLoaderToBeRemoved();
    expect(screen.getByRole("checkbox", { name: "Gadget" })).toBeChecked();

    userEvent.click(screen.getByRole("checkbox", { name: "Gadget" }));
    userEvent.click(screen.getByRole("button", { name: "Apply filters" }));
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
});
