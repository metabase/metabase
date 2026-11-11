import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { makeSummaryFormula } from "../../../../utils/summary-formulas";

import { updateSummaryFormula } from "./update-summary-formula";

const STAGE_INDEX = 0;

function getExpression(query: Lib.Query, name: string) {
  return Lib.expressions(query, STAGE_INDEX).find(
    (clause) =>
      Lib.displayInfo(query, STAGE_INDEX, clause).displayName === name,
  );
}

describe("updateSummaryFormula", () => {
  it("keeps ownership of a formula that references a renamed formula", () => {
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
                operator: "*",
                args: [
                  { type: "column", name: "A" },
                  { type: "literal", value: 2 },
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
      .map((name) => makeSummaryFormula(query, STAGE_INDEX, name))
      .filter(isNotNull);
    const expression = getExpression(query, "A");
    expect(expression).toBeDefined();
    if (!expression) {
      return;
    }

    const renamed = updateSummaryFormula({
      query,
      nextQuery: Lib.replaceClause(
        query,
        STAGE_INDEX,
        expression,
        Lib.withExpressionName(expression, "Renamed"),
      ),
      stageIndex: STAGE_INDEX,
      generatedExpressions,
      renamedExpression: { from: "A", to: "Renamed" },
    });
    expect(renamed.generatedExpressions.map((formula) => formula.name)).toEqual(
      ["Renamed", "B"],
    );

    const [, dependentBreakout] = Lib.breakouts(renamed.query, STAGE_INDEX);
    const removed = updateSummaryFormula({
      query: renamed.query,
      nextQuery: Lib.removeClause(
        renamed.query,
        STAGE_INDEX,
        dependentBreakout,
      ),
      stageIndex: STAGE_INDEX,
      generatedExpressions: renamed.generatedExpressions,
    });
    expect(getExpression(removed.query, "B")).toBeUndefined();
    expect(getExpression(removed.query, "Renamed")).toBeDefined();
  });
});
