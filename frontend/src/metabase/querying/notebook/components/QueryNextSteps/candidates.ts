import { t } from "ttag";

import * as Lib from "metabase-lib";

export type QueryStep = {
  id: string;
  kind: "aggregation" | "custom column" | "join";
  title: string;
  description: string;
  apply: () => Promise<Lib.Query>;
  probability?: number;
};

export function localCandidates(currentQuery: Lib.Query): QueryStep[] {
  const summarized = Lib.aggregations(currentQuery, -1).length > 0;
  const query = summarized ? Lib.appendStage(currentQuery) : currentQuery;
  const stage = -1;
  const candidates: QueryStep[] = [];
  const add = (
    kind: QueryStep["kind"],
    title: string,
    description: string,
    next: () => Lib.Query,
  ) => {
    candidates.push({
      id: `step_${candidates.length}`,
      kind,
      title,
      description: summarized
        ? `${description}. Operates on the current summarized results in a new stage.`
        : description,
      apply: async () => next(),
    });
  };
  if (Lib.aggregations(query, stage).length === 0) {
    add(
      "aggregation",
      t`Count rows`,
      "Count the rows matching the current filters",
      () => Lib.aggregateByCount(query, stage),
    );
    const dimensions = Lib.breakoutableColumns(query, stage)
      .filter((c) => !Lib.isID(c) && !Lib.isNumeric(c) && !Lib.isTemporal(c))
      .slice(0, 4);
    for (const column of dimensions) {
      const name = Lib.displayInfo(query, stage, column).longDisplayName;
      add(
        "aggregation",
        t`Count by ${name}`,
        `Count rows grouped by ${name}`,
        () => Lib.breakout(Lib.aggregateByCount(query, stage), stage, column),
      );
    }
    const sum = Lib.availableAggregationOperators(query, stage).find(
      (op) => Lib.displayInfo(query, stage, op).shortName === "sum",
    );
    if (sum) {
      for (const column of Lib.aggregationOperatorColumns(sum)
        .filter((c) => !Lib.isID(c))
        .slice(0, 3)) {
        const name = Lib.displayInfo(query, stage, column).longDisplayName;
        add(
          "aggregation",
          t`Sum ${name}`,
          `Sum ${name} over rows matching the current filters`,
          () => Lib.aggregate(query, stage, Lib.aggregationClause(sum, column)),
        );
      }
    }
  }
  const numeric = Lib.expressionableColumns(query, stage)
    .filter((c) => Lib.isNumeric(c) && !Lib.isID(c))
    .slice(0, 4);
  for (
    let i = 0;
    i < numeric.length &&
    candidates.filter((c) => c.kind === "custom column").length < 4;
    i++
  ) {
    for (
      let j = i + 1;
      j < numeric.length &&
      candidates.filter((c) => c.kind === "custom column").length < 4;
      j++
    ) {
      const a = Lib.displayInfo(query, stage, numeric[i]).longDisplayName;
      const b = Lib.displayInfo(query, stage, numeric[j]).longDisplayName;
      const name = `${a} minus ${b}`;
      const clause = Lib.expressionClause("-", [numeric[i], numeric[j]]);
      if (Lib.diagnoseExpression(query, stage, "expression", clause)) {
        continue;
      }
      if (
        Lib.expressions(query, stage).some(
          (e) => Lib.displayInfo(query, stage, e).displayName === name,
        )
      ) {
        continue;
      }
      add(
        "custom column",
        name,
        `Add calculated column ${name}: subtract ${b} from ${a}. Only useful if these quantities have compatible units and meaningful difference.`,
        () => Lib.expression(query, stage, name, clause),
      );
    }
  }
  return candidates;
}
