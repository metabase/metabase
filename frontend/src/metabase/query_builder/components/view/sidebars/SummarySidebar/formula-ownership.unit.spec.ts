import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { removeUnusedFormula } from "./formula-ownership";

describe("removeUnusedFormula", () => {
  it("removes unused formulas but preserves direct and later-stage dependents", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          expressions: [
            {
              name: "Double total",
              value: {
                type: "operator",
                operator: "*",
                args: [
                  { type: "column", name: "TOTAL" },
                  { type: "literal", value: 2 },
                ],
              },
            },
          ],
        },
      ],
    });
    const [expression] = Lib.expressions(query, 0);
    const withoutFormula = removeUnusedFormula(query, 0, expression);
    expect(Lib.expressions(withoutFormula, 0)).toEqual([]);
    const selectedQuery = Lib.withFields(
      query,
      0,
      Lib.fieldableColumns(query, 0).filter((column) =>
        ["QUANTITY", "Double total"].includes(
          Lib.displayInfo(query, 0, column).name,
        ),
      ),
    );
    expect(removeUnusedFormula(selectedQuery, 0, expression)).toBe(
      selectedQuery,
    );

    for (const stageIndex of [0, 1]) {
      const stagedQuery = stageIndex === 0 ? query : Lib.appendStage(query);
      const column = Lib.filterableColumns(stagedQuery, stageIndex).find(
        (column) =>
          Lib.displayInfo(stagedQuery, stageIndex, column).name ===
          "Double total",
      );
      expect(column).toBeDefined();
      if (!column) {
        return;
      }
      const dependentQueries = [
        Lib.filter(
          stagedQuery,
          stageIndex,
          Lib.expressionClause(">", [column, 100]),
        ),
        Lib.aggregate(
          stagedQuery,
          stageIndex,
          Lib.expressionClause("sum", [column]),
        ),
        Lib.expression(
          stagedQuery,
          stageIndex,
          "Dependent formula",
          Lib.expressionClause("+", [column, 1]),
        ),
      ];
      for (const dependentQuery of dependentQueries) {
        expect(removeUnusedFormula(dependentQuery, 0, expression)).toBe(
          dependentQuery,
        );
      }
    }
  });
});
