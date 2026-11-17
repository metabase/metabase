import { useAsync } from "react-use";

import { format } from "metabase/querying/expressions";
import { Ellipsified } from "metabase/ui";
import type * as Lib from "metabase-lib";

type FormulaLabelProps = {
  query: Lib.Query;
  stageIndex: number;
  clause: Lib.AggregationClause | Lib.ExpressionClause;
  label: string;
};

export function FormulaLabel({
  query,
  stageIndex,
  clause,
  label,
}: FormulaLabelProps) {
  const { value: formula } = useAsync(
    () => format(clause, { query, stageIndex, printWidth: Infinity }),
    [query, stageIndex, clause],
  );

  return (
    <Ellipsified
      fw="inherit"
      tooltip={formula}
      alwaysShowTooltip
      tooltipProps={{ multiline: true, maw: 360 }}
    >
      {label}
    </Ellipsified>
  );
}
