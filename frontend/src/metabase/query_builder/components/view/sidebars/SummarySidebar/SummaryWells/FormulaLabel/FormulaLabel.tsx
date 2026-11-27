import { useAsync } from "react-use";

import { isDefaultFormulaName } from "metabase/querying/components/FormulaEditor";
import { format } from "metabase/querying/expressions";
import { Ellipsified } from "metabase/ui";
import * as Lib from "metabase-lib";

type FormulaLabelProps = {
  query: Lib.Query;
  stageIndex: number;
  clause: Lib.AggregationClause | Lib.ExpressionClause;
  label: string;
};

/**
 * The label of a formula chip. Its tooltip shows the formula behind a name made from that formula, which can be
 * cut short. A name the user chose shows in full instead.
 */
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
  const { displayName, isNamed } = Lib.displayInfo(query, stageIndex, clause);
  const hasCustomName =
    isNamed === true &&
    formula !== undefined &&
    !isDefaultFormulaName(displayName, formula);

  return (
    <Ellipsified
      fw="inherit"
      tooltip={hasCustomName ? label : formula}
      alwaysShowTooltip={!hasCustomName}
      tooltipProps={{ multiline: true, maw: 360 }}
    >
      {label}
    </Ellipsified>
  );
}
