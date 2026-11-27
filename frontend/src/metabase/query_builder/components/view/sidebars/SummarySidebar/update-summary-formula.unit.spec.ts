import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { makeSummaryFormula } from "../../../../utils/summary-formulas";

import { updateSummaryFormula } from "./update-summary-formula";

function createChainedQuery(increment: number) {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        expressions: [
          {
            name: "A",
            value: {
              type: "operator",
              operator: "+",
              args: [
                { type: "column", name: "TOTAL" },
                { type: "literal", value: increment },
              ],
            },
          },
          {
            name: "B",
            value: {
              type: "operator",
              operator: "+",
              args: [
                { type: "column", name: "A" },
                { type: "literal", value: 5 },
              ],
            },
          },
        ],
        aggregations: [{ type: "operator", operator: "count" }],
        breakouts: [
          { type: "column", name: "A" },
          { type: "column", name: "B" },
        ],
      },
    ],
  });
}

describe("updateSummaryFormula", () => {
  it("keeps owning the formulas that refer to an edited formula", () => {
    const query = createChainedQuery(10);
    const generatedExpressions = ["A", "B"]
      .map((name) => makeSummaryFormula(query, -1, name))
      .filter(isNotNull);
    const [expression] = Lib.expressions(query, -1);
    const [editedExpression] = Lib.expressions(createChainedQuery(20), -1);
    const nextQuery = Lib.replaceClause(
      query,
      -1,
      expression,
      editedExpression,
    );

    const result = updateSummaryFormula({
      query,
      nextQuery,
      stageIndex: -1,
      generatedExpressions,
      editedFormula: true,
    });

    expect(result.query).toBe(nextQuery);
    expect(result.generatedExpressions).toEqual(
      ["A", "B"]
        .map((name) => makeSummaryFormula(nextQuery, -1, name))
        .filter(isNotNull),
    );
  });

  it("keeps owning the formulas that refer to a renamed formula", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          expressions: [
            {
              name: "A",
              value: {
                type: "operator",
                operator: "+",
                args: [
                  { type: "column", name: "TOTAL" },
                  { type: "literal", value: 10 },
                ],
              },
            },
            {
              name: "B",
              value: {
                type: "operator",
                operator: "+",
                args: [
                  { type: "column", name: "A" },
                  { type: "literal", value: 5 },
                ],
              },
            },
          ],
          aggregations: [{ type: "operator", operator: "count" }],
          breakouts: [
            { type: "column", name: "A" },
            { type: "column", name: "B" },
          ],
        },
      ],
    });
    const generatedExpressions = ["A", "B"]
      .map((name) => makeSummaryFormula(query, -1, name))
      .filter(isNotNull);
    const [expression] = Lib.expressions(query, -1);
    const nextQuery = Lib.replaceClause(
      query,
      -1,
      expression,
      Lib.withExpressionName(expression, "New A"),
    );

    const result = updateSummaryFormula({
      query,
      nextQuery,
      stageIndex: -1,
      generatedExpressions,
      renamedFormula: { name: "A", nextName: "New A" },
    });

    expect(result.query).toBe(nextQuery);
    expect(result.generatedExpressions.map(({ name }) => name)).toEqual([
      "New A",
      "B",
    ]);
  });
});
