import * as Lib from "metabase-lib";
import { columnFinder } from "metabase-lib/test-helpers";

import {
  createQueryWithNumberFilter,
  createQueryWithStringFilter,
  createSummarizedQuery,
  findNumericColumn,
} from "../FilterPicker/test-utils";

import { createQueryAdapter } from "./adapter";
import { applyQueryStages, getFilterQuery, getQueryStages } from "./stages";

const createQueryWithOrFilter = () => {
  const { query } = createQueryWithNumberFilter({
    operator: ">",
    values: [10],
  });
  const column = findNumericColumn(query);
  return Lib.filter(
    query,
    0,
    Lib.expressionClause("or", [
      Lib.numberFilterClause({ operator: "=", column, values: [1] }),
      Lib.numberFilterClause({ operator: "=", column, values: [2] }),
    ]),
  );
};

describe("QueryFilterBar adapter", () => {
  it("reads stage filters as an implicit AND and opens an OR clause into a group", () => {
    const [stage] = getQueryStages(createQueryWithOrFilter());

    expect(stage).toMatchObject({
      type: "and",
      children: [{ type: "leaf" }, { type: "or" }],
    });
  });

  it("writes an unedited query back unchanged", () => {
    const query = createQueryWithOrFilter();

    const nextQuery = applyQueryStages(query, getQueryStages(query));

    expect(
      Lib.areQueriesEqual(Lib.toJsQuery(nextQuery), Lib.toJsQuery(query)),
    ).toBe(true);
  });

  it("shows a standard filter as parts", () => {
    const { query, filter } = createQueryWithNumberFilter({
      operator: ">",
      values: [10],
    });

    expect(createQueryAdapter(query).stage(0).toPill(filter)).toEqual({
      type: "parts",
      parts: {
        column: expect.objectContaining({ label: "Total" }),
        operator: expect.objectContaining({ key: ">" }),
        values: ["10"],
      },
    });
  });

  it.each([
    [true, "opaque"],
    [false, "parts"],
  ])(
    "shows a contains filter with caseSensitive %s as %s",
    (caseSensitive, type) => {
      const { query, filter } = createQueryWithStringFilter({
        operator: "contains",
        values: ["Gi"],
        options: { caseSensitive },
      });

      expect(createQueryAdapter(query).stage(0).toPill(filter).type).toBe(type);
    },
  );

  it("puts summary filters into a new stage and drops it when empty", () => {
    const query = createSummarizedQuery();
    const filterQuery = getFilterQuery(query);
    const column = columnFinder(
      filterQuery,
      Lib.filterableColumns(filterQuery, 1),
    )(null, "count");
    const filter = Lib.numberFilterClause({
      operator: ">",
      column,
      values: [5],
    });

    const filteredQuery = applyQueryStages(query, [
      { type: "and", children: [] },
      { type: "and", children: [{ type: "leaf", filter }] },
    ]);

    expect(Lib.stageCount(filteredQuery)).toBe(2);
    expect(Lib.filters(filteredQuery, 1)).toHaveLength(1);
    expect(Lib.stageCount(applyQueryStages(filteredQuery, []))).toBe(1);
  });
});
