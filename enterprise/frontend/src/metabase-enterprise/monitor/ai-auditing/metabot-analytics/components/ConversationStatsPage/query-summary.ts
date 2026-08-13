import type { Query } from "metabase-lib";
import * as Lib from "metabase-lib";

type ExprArg = Lib.ExpressionArg | Lib.ExpressionParts;

const fmtExpr = (q: Query, e: ExprArg): string => {
  if (Lib.isExpressionParts(e)) {
    return `${e.operator}(${e.args.map((a) => fmtExpr(q, a)).join(", ")})`;
  }
  if (Lib.isColumnMetadata(e)) {
    return Lib.displayInfo(q, 0, e).displayName;
  }
  return String(e);
};

const fmtFilter = (q: Query, f: Lib.FilterClause): string =>
  Lib.displayInfo(q, 0, f).displayName;

const fmtJoin = (q: Query, j: Lib.Join): string => {
  const tableName = Lib.displayInfo(q, 0, Lib.joinedThing(q, j)).name;
  const strategy = Lib.displayInfo(q, 0, Lib.joinStrategy(j)).shortName;
  const conditions = Lib.joinConditions(j).map((c) => {
    const { operator, lhsExpression, rhsExpression } =
      Lib.joinConditionParts(c);
    const lhs = Lib.displayInfo(q, 0, lhsExpression).displayName;
    const rhs = Lib.displayInfo(q, 0, rhsExpression).displayName;
    return `${lhs} ${operator} ${tableName}.${rhs}`;
  });
  return `${strategy} ${tableName} on ${conditions.join(", ")}`;
};

const fmtAggregation = (q: Query, a: Lib.AggregationClause): string => {
  const { operator, args } = Lib.expressionParts(q, 0, a);
  return `${operator}(${args.map((arg) => fmtExpr(q, arg)).join(", ")})`;
};

const fmtBreakout = (q: Query, b: Lib.BreakoutClause): string => {
  const { displayName } = Lib.displayInfo(q, 0, b);
  const bucket = Lib.temporalBucket(b);
  const bucketName = bucket ? Lib.displayInfo(q, 0, bucket).shortName : null;
  return bucketName ? `${displayName} (bucket: ${bucketName})` : displayName;
};

const fmtOrderBy = (q: Query, o: Lib.OrderByClause): string => {
  const { name, direction } = Lib.displayInfo(q, 0, o);
  return `${name} ${direction}`;
};

export const summarize = (q: Query): string => {
  return (
    [
      ["filters", Lib.filters(q, 0).map((f) => fmtFilter(q, f))],
      ["joins", Lib.joins(q, 0).map((j) => fmtJoin(q, j))],
      ["aggregations", Lib.aggregations(q, 0).map((a) => fmtAggregation(q, a))],
      ["breakouts", Lib.breakouts(q, 0).map((b) => fmtBreakout(q, b))],
      ["orderBys", Lib.orderBys(q, 0).map((o) => fmtOrderBy(q, o))],
    ] as const
  )
    .filter(([, items]) => items.length > 0)
    .map(([l, i]) => `${l}: [${i.map((s) => JSON.stringify(s)).join(", ")}]`)
    .join("\n");
};
