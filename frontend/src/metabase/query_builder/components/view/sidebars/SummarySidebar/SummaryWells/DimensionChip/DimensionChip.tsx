import * as Lib from "metabase-lib";
import { getUniqueExpressionName } from "metabase-lib/v1/queries/utils/expression";

import S from "../../SummarySidebar.module.css";
import type {
  SummaryDimensionItem,
  SummaryQueryChangeOptions,
} from "../../types";
import { FormulaChip } from "../FormulaChip";
import { WellChip } from "../WellChip";

type DimensionChipProps = {
  query: Lib.Query;
  stageIndex: number;
  item: SummaryDimensionItem;
  canRename: boolean;
  onChange: (nextQuery: Lib.Query, options?: SummaryQueryChangeOptions) => void;
  onRemove: () => void;
  onFocusInput: () => void;
};

export function DimensionChip({
  query,
  stageIndex,
  item,
  canRename,
  onChange,
  onRemove,
  onFocusInput,
}: DimensionChipProps) {
  const { expression } = item;
  if (expression && canRename) {
    const currentName = Lib.displayInfo(
      query,
      stageIndex,
      expression,
    ).displayName;
    const handleRename = (name: string) => {
      const uniqueName = getUniqueExpressionName(query, stageIndex, name);
      const nextQuery = Lib.replaceClause(
        query,
        stageIndex,
        expression,
        Lib.withExpressionName(expression, uniqueName),
      );
      onChange(nextQuery, {
        renamedExpression: { from: currentName, to: uniqueName },
      });
    };
    return (
      <FormulaChip
        drag={{ kind: "dimension", item }}
        name={currentName}
        onRename={handleRename}
        onRemove={onRemove}
        onFocusInput={onFocusInput}
      />
    );
  }
  return (
    <WellChip drag={{ kind: "dimension", item }} onRemove={onRemove}>
      <span className={S.chipLabel}>{item.label}</span>
    </WellChip>
  );
}
