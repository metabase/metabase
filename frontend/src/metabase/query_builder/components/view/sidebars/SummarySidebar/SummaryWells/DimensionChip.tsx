import { Ellipsified } from "metabase/ui";
import * as Lib from "metabase-lib";
import { getUniqueExpressionName } from "metabase-lib/v1/queries/utils/expression";

import type { SummaryFormulaInput } from "../SummaryFormulaBar";
import type {
  SummaryBucketOption,
  SummaryDimensionItem,
  SummaryDimensionWellId,
  SummaryQueryChangeOptions,
} from "../types";
import { changeDimensionBucket } from "../utils";

import { DimensionBucketMenu } from "./DimensionBucketMenu";
import { FormulaEditButton } from "./FormulaEditButton";
import { FormulaLabel } from "./FormulaLabel";
import { useWellFieldRef } from "./SummaryWell";
import { WellChip, type WellChipRename } from "./WellChip";
import { splitBucketLabel } from "./utils";

type DimensionChipProps = {
  query: Lib.Query;
  stageIndex: number;
  wellId: SummaryDimensionWellId;
  item: SummaryDimensionItem;
  isEditing: boolean;
  /** Absent when the database can't take formulas in this well. */
  formulaInput?: SummaryFormulaInput;
  onChange: (nextQuery: Lib.Query, options?: SummaryQueryChangeOptions) => void;
  onRemove: () => void;
};

export function DimensionChip({
  query,
  stageIndex,
  wellId,
  item,
  isEditing,
  formulaInput,
  onChange,
  onRemove,
}: DimensionChipProps) {
  const wellFieldRef = useWellFieldRef();

  const handleBucketSelect = (option: SummaryBucketOption) => {
    const nextQuery = changeDimensionBucket(query, stageIndex, item, option);
    if (nextQuery !== query) {
      onChange(nextQuery);
    }
  };

  const getFormulaRename = (
    expression: Lib.ExpressionClause,
  ): WellChipRename => {
    const { displayName } = Lib.displayInfo(query, stageIndex, expression);
    return {
      name: displayName,
      onRename: (name) => {
        const nextName = getUniqueExpressionName(query, stageIndex, name);
        onChange(
          Lib.replaceClause(
            query,
            stageIndex,
            expression,
            Lib.withExpressionName(expression, nextName),
          ),
          { renamedFormula: { name: displayName, nextName } },
        );
      },
    };
  };

  const hasBucketMenu = item.bucketOptions.length > 0;
  const bucketLabel = hasBucketMenu
    ? splitBucketLabel(query, stageIndex, item)
    : null;
  const name = bucketLabel?.name ?? item.label;
  const label = item.expression ? (
    <FormulaLabel
      query={query}
      stageIndex={stageIndex}
      clause={item.expression}
      label={name}
    />
  ) : (
    <Ellipsified fw="inherit" tooltip={item.label}>
      {name}
    </Ellipsified>
  );
  const { expression } = item;

  return (
    <WellChip
      drag={{ kind: "dimension", item, wellId }}
      rename={
        expression && !isEditing ? getFormulaRename(expression) : undefined
      }
      isSelected={isEditing}
      onRemove={onRemove}
    >
      {expression && formulaInput ? (
        <FormulaEditButton
          label={item.label}
          isEditing={isEditing}
          onEdit={() =>
            formulaInput.edit(
              expression,
              wellFieldRef?.current ?? null,
              "chip_edit",
            )
          }
          onCancelEdit={() => formulaInput.cancelEdit(expression)}
        >
          {label}
        </FormulaEditButton>
      ) : (
        label
      )}
      {hasBucketMenu && (
        <DimensionBucketMenu item={item} onSelect={handleBucketSelect}>
          {bucketLabel?.bucket}
        </DimensionBucketMenu>
      )}
    </WellChip>
  );
}
