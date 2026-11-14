import _ from "underscore";

import type { SummaryGeneratedExpression } from "metabase/redux/store";
import { Ellipsified } from "metabase/ui";
import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { getUniqueExpressionName } from "metabase-lib/v1/queries/utils/expression";

import { makeSummaryFormula } from "../../../../../utils/summary-formulas";
import type { SummaryFormulaInput } from "../SummaryFormulaBar";
import type {
  SummaryBucketOption,
  SummaryDimensionItem,
  SummaryQueryChangeOptions,
} from "../types";
import { changeDimensionBucket } from "../utils";

import { DimensionBucketMenu } from "./DimensionBucketMenu";
import { FormulaLabel } from "./FormulaLabel";
import { useWellFieldRef } from "./SummaryWell";
import { WellChip, type WellChipRename } from "./WellChip";

type DimensionChipProps = {
  query: Lib.Query;
  stageIndex: number;
  item: SummaryDimensionItem;
  generatedExpressions: SummaryGeneratedExpression[];
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
  generatedExpressions,
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
  ): WellChipRename | undefined => {
    const { displayName } = Lib.displayInfo(query, stageIndex, expression);
    const formula = makeSummaryFormula(query, stageIndex, displayName);
    const isOwned =
      isNotNull(formula) &&
      generatedExpressions.some((owned) => _.isEqual(owned, formula));
    if (!isOwned) {
      return undefined;
    }
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

  const rename = item.expression && getFormulaRename(item.expression);
  const handleEdit =
    rename && formulaInput
      ? () => formulaInput.edit(item.key, wellFieldRef?.current ?? null)
      : undefined;
  const hasBucketMenu = item.bucketOptions.length > 0;

  return (
    <WellChip
      drag={{ kind: "dimension", item }}
      rename={rename}
      isSelected={isEditing}
      onRemove={onRemove}
    >
      {handleEdit && (
        <FormulaLabel
          label={item.label}
          isEditing={isEditing}
          onEdit={handleEdit}
          onCancelEdit={() => formulaInput?.cancelEdit(item.key)}
        />
      )}
      {hasBucketMenu && (
        <DimensionBucketMenu
          item={item}
          hasLabel={!handleEdit}
          onSelect={handleBucketSelect}
        />
      )}
      {!hasBucketMenu && !handleEdit && (
        <Ellipsified fw="inherit">{item.label}</Ellipsified>
      )}
    </WellChip>
  );
}
