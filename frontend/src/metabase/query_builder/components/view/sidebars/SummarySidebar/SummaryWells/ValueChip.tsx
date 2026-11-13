import { Ellipsified, FixedSizeIcon } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

import type { SummaryFormulaInput } from "../SummaryFormulaBar";
import type { SummaryValueItem } from "../types";

import { ColumnValueMenu } from "./ColumnValueMenu";
import { FormulaEditButton } from "./FormulaEditButton";
import { FormulaLabel } from "./FormulaLabel";
import { useWellFieldRef } from "./SummaryWell";
import { WellChip } from "./WellChip";

const VALUE_ICONS: Record<
  Exclude<SummaryValueItem["kind"], "column">,
  IconName
> = {
  count: "sum",
  metric: "metric",
  measure: "ruler",
  expression: "function",
};

type ValueChipProps = {
  query: Lib.Query;
  stageIndex: number;
  item: SummaryValueItem;
  isEditing: boolean;
  /** Absent when the database can't take formulas in this well. */
  formulaInput?: SummaryFormulaInput;
  onChange: (nextQuery: Lib.Query) => void;
  onRemove: () => void;
};

export function ValueChip({
  query,
  stageIndex,
  item,
  isEditing,
  formulaInput,
  onChange,
  onRemove,
}: ValueChipProps) {
  const wellFieldRef = useWellFieldRef();
  const isFormula = item.kind === "expression" || item.isNamed;
  const handleRename = (name: string) =>
    onChange(
      Lib.replaceClause(
        query,
        stageIndex,
        item.clause,
        Lib.withExpressionName(item.clause, name),
      ),
    );
  const handleEdit =
    isFormula && formulaInput
      ? () => formulaInput.edit(item.key, wellFieldRef?.current ?? null)
      : undefined;
  const icon =
    item.kind === "column" ? null : (
      <FixedSizeIcon name={VALUE_ICONS[item.kind]} size={12} />
    );
  const label =
    item.kind === "expression" ? (
      <FormulaLabel
        query={query}
        stageIndex={stageIndex}
        clause={item.clause}
        label={item.label}
      />
    ) : (
      <Ellipsified fw="inherit">{item.label}</Ellipsified>
    );

  return (
    <WellChip
      drag={{ kind: "value", item }}
      rename={
        isFormula ? { name: item.label, onRename: handleRename } : undefined
      }
      isSelected={isEditing}
      onRemove={onRemove}
    >
      {handleEdit && (
        <FormulaEditButton label={item.label} onEdit={handleEdit}>
          {icon}
          {label}
        </FormulaEditButton>
      )}
      {item.kind === "column" && (
        <ColumnValueMenu
          query={query}
          stageIndex={stageIndex}
          item={item}
          hasLabel={!handleEdit}
          onChange={onChange}
        />
      )}
      {item.kind !== "column" && !handleEdit && (
        <>
          {icon}
          {label}
        </>
      )}
    </WellChip>
  );
}
