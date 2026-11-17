import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { FilterPanel } from "./FilterPanel";

type SetupOpts = {
  query: Lib.Query;
};

function setup({ query }: SetupOpts) {
  const onChange = jest.fn<void, [Lib.Query]>();

  renderWithProviders(<FilterPanel query={query} onChange={onChange} />);

  function getNextQuery() {
    expect(onChange).toHaveBeenCalledTimes(1);
    const [nextQuery] = onChange.mock.calls[0];
    return nextQuery;
  }

  return { getNextQuery };
}

function getClauseNames(
  query: Lib.Query,
  stageIndex: number,
  clauses: Lib.Clause[],
) {
  return clauses.map(
    (clause) => Lib.displayInfo(query, stageIndex, clause).displayName,
  );
}

function createQueryWithExpressionsAfterAggregation() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        filters: [
          {
            type: "operator",
            operator: ">",
            args: [
              { type: "column", name: "SUBTOTAL" },
              { type: "literal", value: 0 },
            ],
          },
        ],
        aggregations: [
          {
            type: "operator",
            operator: "sum",
            args: [{ type: "column", name: "TOTAL" }],
          },
          {
            name: "13857_CE",
            value: {
              type: "operator",
              operator: "*",
              args: [
                { type: "operator", operator: "count", args: [] },
                { type: "literal", value: 1 },
              ],
            },
          },
        ],
        breakouts: [{ type: "column", name: "CREATED_AT", unit: "year" }],
      },
      {
        expressions: [
          {
            name: "Double the fun",
            value: {
              type: "operator",
              operator: "*",
              args: [
                { type: "column", name: "sum" },
                { type: "literal", value: 2 },
              ],
            },
          },
          {
            name: "13857_CC",
            value: {
              type: "operator",
              operator: "*",
              args: [
                { type: "column", name: "13857_CE" },
                { type: "literal", value: 1234 },
              ],
            },
          },
        ],
      },
    ],
  });
}

describe("FilterPanel", () => {
  it("should keep custom columns that use the aggregations of a previous stage when removing its filter (metabase#13857, metabase#14193)", async () => {
    const query = createQueryWithExpressionsAfterAggregation();
    const { getNextQuery } = setup({ query });

    const pill = screen.getByText("Subtotal is greater than 0");
    await userEvent.click(within(pill).getByRole("button", { name: "Remove" }));

    const nextQuery = getNextQuery();
    expect(Lib.stageCount(nextQuery)).toBe(2);
    expect(Lib.filters(nextQuery, 0)).toHaveLength(0);
    expect(
      getClauseNames(nextQuery, 0, Lib.aggregations(nextQuery, 0)),
    ).toEqual(["Sum of Total", "13857_CE"]);
    expect(getClauseNames(nextQuery, 0, Lib.breakouts(nextQuery, 0))).toEqual([
      "Created At: Year",
    ]);
    expect(getClauseNames(nextQuery, 1, Lib.expressions(nextQuery, 1))).toEqual(
      ["Double the fun", "13857_CC"],
    );
  });
});
