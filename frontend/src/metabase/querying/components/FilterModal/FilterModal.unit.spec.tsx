import userEvent from "@testing-library/user-event";
import {
  act,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { setupFieldValuesEndpoints } from "__support__/server-mocks";
import {
  PEOPLE_SOURCE_VALUES,
  PRODUCT_CATEGORY_VALUES,
  PRODUCT_VENDOR_VALUES,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import { createQuery, createQueryWithClauses } from "metabase-lib/test-helpers";
import { FilterModal } from "./FilterModal";

interface SetupOpts {
  query?: Lib.Query;
}

function setup({ query = createQuery() }: SetupOpts = {}) {
  const onSubmit = jest.fn();
  const onClose = jest.fn();

  setupFieldValuesEndpoints(PRODUCT_CATEGORY_VALUES);
  setupFieldValuesEndpoints(PRODUCT_VENDOR_VALUES);
  setupFieldValuesEndpoints(PEOPLE_SOURCE_VALUES);

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
  beforeAll(() => {
    jest.useFakeTimers({ advanceTimers: true });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("should allow to add filters", async () => {
    const { getNextQuery } = setup();

    const totalSection = screen.getByTestId("filter-column-Total");
    userEvent.type(within(totalSection).getByPlaceholderText("Min"), "10");
    userEvent.type(within(totalSection).getByPlaceholderText("Max"), "20");
    userEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    const nextQuery = getNextQuery();
    expect(Lib.stageCount(nextQuery)).toBe(1);
    expect(Lib.filters(nextQuery, 0)).toHaveLength(1);
  });

  it("should allow to add filters for implicitly joined tables", async () => {
    const { getNextQuery } = setup();

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
    const { getNextQuery } = setup();

    const searchInput = screen.getByPlaceholderText("Search for a column…");
    userEvent.type(searchInput, "created");
    act(() => jest.advanceTimersByTime(1000));
    const sections = screen.getAllByTestId("filter-column-Created At");
    expect(sections).toHaveLength(3);

    const [ordersSection, productSection, peopleSection] = sections;
    expect(within(ordersSection).getByText("Orders")).toBeInTheDocument();
    expect(within(productSection).getByText("Products")).toBeInTheDocument();
    expect(within(peopleSection).getByText("People")).toBeInTheDocument();

    userEvent.click(within(ordersSection).getByText("Today"));
    userEvent.click(within(productSection).getByText("Yesterday"));
    userEvent.click(within(peopleSection).getByText("Last month"));
    userEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    const nextQuery = getNextQuery();
    expect(Lib.stageCount(nextQuery)).toBe(1);
    expect(Lib.filters(nextQuery, 0)).toHaveLength(3);
  });

  it("should order columns by type", () => {
    setup();

    const columns = screen.getAllByTestId(/filter-column/);
    expect(within(columns[0]).getByText("Created At")).toBeInTheDocument();
    expect(within(columns[1]).getByText("Discount")).toBeInTheDocument();
    expect(within(columns[2]).getByText("Subtotal")).toBeInTheDocument();
    expect(within(columns[3]).getByText("Tax")).toBeInTheDocument();
    expect(within(columns[4]).getByText("Total")).toBeInTheDocument();
    expect(within(columns[5]).getByText("Quantity")).toBeInTheDocument();
    expect(within(columns[6]).getByText("ID")).toBeInTheDocument();
    expect(within(columns[7]).getByText("User ID")).toBeInTheDocument();
    expect(within(columns[8]).getByText("Product ID")).toBeInTheDocument();
  });
});
