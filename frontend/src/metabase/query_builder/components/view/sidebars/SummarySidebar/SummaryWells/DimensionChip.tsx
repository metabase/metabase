import { Ellipsified } from "metabase/ui";
import * as Lib from "metabase-lib";
import { getUniqueExpressionName } from "metabase-lib/v1/queries/utils/expression";

import type { SummaryFormulaInput } from "../SummaryFormulaBar";
import type {
  SummaryBucketOption,
  SummaryDimensionItem,
  SummaryQueryChangeOptions,
} from "../types";
import { changeDimensionBucket } from "../utils";

import { DimensionBucketMenu } from "./DimensionBucketMenu";
import { FormulaEditButton } from "./FormulaEditButton";
import { FormulaLabel } from "./FormulaLabel";
import { useWellFieldRef } from "./SummaryWell";
import { WellChip, type WellChipRename } from "./WellChip";

type DimensionChipProps = {
  query: Lib.Query;
  stageIndex: number;
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

  const label = item.expression ? (
    <FormulaLabel
      query={query}
      stageIndex={stageIndex}
      clause={item.expression}
      label={item.label}
    />
  ) : (
    <Ellipsified fw="inherit">{item.label}</Ellipsified>
  );
  const handleEdit =
    item.expression && formulaInput
      ? () => formulaInput.edit(item.key, wellFieldRef?.current ?? null)
      : undefined;
  const hasBucketMenu = item.bucketOptions.length > 0;

  return (
    <WellChip
      drag={{ kind: "dimension", item }}
      rename={item.expression && getFormulaRename(item.expression)}
      isSelected={isEditing}
      onRemove={onRemove}
    >
      {handleEdit && (
        <FormulaEditButton
          label={item.label}
          isEditing={isEditing}
          onEdit={handleEdit}
          onCancelEdit={() => formulaInput?.cancelEdit(item.key)}
        >
          {label}
        </FormulaEditButton>
      )}
      {hasBucketMenu && (
        <DimensionBucketMenu item={item} onSelect={handleBucketSelect}>
          {handleEdit ? null : label}
        </DimensionBucketMenu>
      )}
      {!hasBucketMenu && !handleEdit && label}
    </WellChip>
  );
}
