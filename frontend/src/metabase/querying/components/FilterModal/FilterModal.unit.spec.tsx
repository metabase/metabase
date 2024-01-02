import userEvent from "@testing-library/user-event";
import {
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
  query: Lib.Query;
}

function setup({ query }: SetupOpts) {
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
  it("should allow to add filters", async () => {
    const { getNextQuery } = setup({
      query: createQuery(),
    });

    const totalSection = screen.getByTestId("filter-column-Total");
    userEvent.type(within(totalSection).getByPlaceholderText("Min"), "10");
    userEvent.type(within(totalSection).getByPlaceholderText("Max"), "20");
    userEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    const nextQuery = getNextQuery();
    expect(Lib.stageCount(nextQuery)).toBe(1);
    expect(Lib.filters(nextQuery, 0)).toHaveLength(1);
  });

  it("should allow to add filters for implicitly joined tables", async () => {
    const { getNextQuery } = setup({
      query: createQuery(),
    });

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
});
