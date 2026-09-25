import type * as Lib from "metabase-lib";

import { flattenAndConditions } from "./CandidateDefinition";

function expression(
  operator: Lib.ExpressionOperator,
  args: Lib.ExpressionParts["args"] = [],
): Lib.ExpressionParts {
  return { operator, args, options: {} };
}

describe("flattenAndConditions", () => {
  it("shows nested AND conditions as separate filters", () => {
    const first = expression("=", ["first", true]);
    const second = expression("=", ["second", true]);
    const third = expression("=", ["third", true]);
    const condition = expression("and", [
      first,
      expression("and", [second, third]),
    ]);

    expect(flattenAndConditions(condition)).toEqual([first, second, third]);
  });

  it("keeps OR conditions grouped", () => {
    const condition = expression("or", [
      expression("=", ["first", true]),
      expression("=", ["second", true]),
    ]);

    expect(flattenAndConditions(condition)).toEqual([condition]);
  });

  it("keeps malformed AND conditions grouped", () => {
    const condition = expression("and", [
      expression("=", ["first", true]),
      true,
    ]);

    expect(flattenAndConditions(condition)).toEqual([condition]);
  });
});
