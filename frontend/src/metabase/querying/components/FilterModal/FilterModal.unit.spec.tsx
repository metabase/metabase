import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import { createQueryWithClauses } from "metabase-lib/test-helpers";
import { FilterModal } from "./FilterModal";

interface SetupOpts {
  query: Lib.Query;
}

function setup({ query }: SetupOpts) {
  const onSubmit = jest.fn();
  const onClose = jest.fn();

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
  it("should allow to add post-aggregation filters", () => {
    const { getNextQuery } = setup({
      query: createQueryWithClauses({
        aggregations: [{ operatorName: "count" }],
        breakouts: [{ tableName: "ORDERS", columnName: "CREATED_AT" }],
      }),
    });

    userEvent.click(screen.getByRole("tab", { name: "Summaries" }));
    const section = screen.getByTestId("filter-column-Count");
    userEvent.type(within(section).getByPlaceholderText("Min"), "10");
    userEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    const nextQuery = getNextQuery();
    expect(Lib.filters(nextQuery, 0)).toHaveLength(0);
    expect(Lib.filters(nextQuery, 1)).toHaveLength(1);
  });
});
