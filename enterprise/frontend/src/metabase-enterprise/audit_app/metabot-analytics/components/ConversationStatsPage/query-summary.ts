import type { Query } from "metabase-lib";
import * as Lib from "metabase-lib";

const formatSection = (label: string, items: string[]): string | null =>
  items.length === 0
    ? null
    : `${label}: [${items.map((s) => JSON.stringify(s)).join(", ")}]`;

export const summarize = (q: Query): string => {
  const filters = Lib.filters(q, 0).map(
    (f) => Lib.displayInfo(q, 0, f).displayName,
  );
  const joins = Lib.joins(q, 0).map((j) => {
    const table = Lib.displayInfo(q, 0, Lib.joinedThing(q, j)).name;
    const strategy = Lib.displayInfo(q, 0, Lib.joinStrategy(j)).shortName;
    const conditions = Lib.joinConditions(j)
      .map((c) => {
        const { operator, lhsExpression, rhsExpression } =
          Lib.joinConditionParts(c);
        const lhs = Lib.displayInfo(q, 0, lhsExpression).displayName;
        const rhs = Lib.displayInfo(q, 0, rhsExpression).displayName;
        return `${lhs} ${operator} ${table}.${rhs}`;
      })
      .join(", ");
    return `${strategy} ${table} on ${conditions}`;
  });
  const formatExprArg = (arg: unknown): string => {
    if (arg === null || typeof arg !== "object") {
      return String(arg);
    }
    if ("operator" in arg) {
      const parts = arg as Lib.ExpressionParts;
      return `${parts.operator}(${parts.args.map(formatExprArg).join(", ")})`;
    }
    return Lib.displayInfo(q, 0, arg as Lib.ColumnMetadata).displayName;
  };
  const aggregations = Lib.aggregations(q, 0).map((a) => {
    const { operator, args } = Lib.expressionParts(q, 0, a);
    return `${operator}(${args.map(formatExprArg).join(", ")})`;
  });
  const breakouts = Lib.breakouts(q, 0).map((b) => {
    const info = Lib.displayInfo(q, 0, b);
    const bucket = Lib.temporalBucket(b);
    const bucketName = bucket ? Lib.displayInfo(q, 0, bucket).shortName : null;
    return bucketName
      ? `${info.displayName} (bucket: ${bucketName})`
      : info.displayName;
  });
  const orderBys = Lib.orderBys(q, 0).map((o) => {
    const info = Lib.displayInfo(q, 0, o);
    return `${info.name} ${info.direction}`;
  });
  return [
    formatSection("filters", filters),
    formatSection("joins", joins),
    formatSection("aggregations", aggregations),
    formatSection("breakouts", breakouts),
    formatSection("orderBys", orderBys),
  ]
    .filter((s) => s !== null)
    .join("\n");
};
