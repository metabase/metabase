import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { TemporalUnit } from "metabase-types/api";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import {
  makeSummaryFormula,
  reconcileSummaryFormulas,
} from "./summary-formulas";

it("preserves formula ownership across query serialization but rejects a changed expression with the same name", () => {
  const query = Lib.appendStage(
    Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          expressions: [
            {
              name: "Generated",
              value: {
                type: "operator",
                operator: "+",
                args: [
                  { type: "column", name: "TOTAL" },
                  { type: "literal", value: 10 },
                ],
              },
            },
          ],
          aggregations: [{ type: "operator", operator: "count" }],
          breakouts: [{ type: "column", name: "Generated" }],
        },
      ],
    }),
  );
  const formula = makeSummaryFormula(query, -2, "Generated");
  expect(formula).toEqual({
    stageIndex: 0,
    name: "Generated",
    expression: expect.any(String),
    breakoutOptions: expect.any(String),
  });
  if (!formula) {
    return;
  }
  const reloadedQuery = Lib.fromJsQuery(SAMPLE_PROVIDER, Lib.toJsQuery(query));
  expect(reconcileSummaryFormulas(reloadedQuery, [formula])).toEqual([formula]);
  const [expression] = Lib.expressions(reloadedQuery, 0);
  const changedQuery = Lib.replaceClause(
    reloadedQuery,
    0,
    expression,
    Lib.withExpressionName(Lib.expressionClause("+", [2, 3]), formula.name),
  );
  expect(Lib.breakouts(changedQuery, 0)).toHaveLength(1);
  expect(reconcileSummaryFormulas(changedQuery, [formula])).toEqual([]);
});

function createDateFormulaQuery(unit: TemporalUnit) {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        expressions: [
          {
            name: "Order date",
            value: {
              type: "operator",
              operator: "datetime-add",
              args: [
                { type: "column", name: "CREATED_AT" },
                { type: "literal", value: 1 },
                { type: "literal", value: "day" },
              ],
            },
          },
        ],
        aggregations: [{ type: "operator", operator: "count" }],
        breakouts: [{ type: "column", name: "Order date", unit }],
      },
    ],
  });
}

it("keeps formula ownership when its grouping changes bucket elsewhere", () => {
  const formula = makeSummaryFormula(
    createDateFormulaQuery("month"),
    0,
    "Order date",
  );
  expect(formula).toBeDefined();
  if (!formula) {
    return;
  }
  expect(
    reconcileSummaryFormulas(createDateFormulaQuery("year"), [formula]),
  ).toEqual([formula]);
});
