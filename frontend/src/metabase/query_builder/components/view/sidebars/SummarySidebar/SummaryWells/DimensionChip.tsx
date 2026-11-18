import { Ellipsified } from "metabase/ui";
import * as Lib from "metabase-lib";
import { getUniqueExpressionName } from "metabase-lib/v1/queries/utils/expression";

import type {
  SummaryBucketOption,
  SummaryDimensionItem,
  SummaryQueryChangeOptions,
} from "../types";
import { changeDimensionBucket } from "../utils";

import { DimensionBucketMenu } from "./DimensionBucketMenu";
import { FormulaLabel } from "./FormulaLabel";
import { WellChip, type WellChipRename } from "./WellChip";

type DimensionChipProps = {
  query: Lib.Query;
  stageIndex: number;
  item: SummaryDimensionItem;
  onChange: (nextQuery: Lib.Query, options?: SummaryQueryChangeOptions) => void;
  onRemove: () => void;
};

export function DimensionChip({
  query,
  stageIndex,
  item,
  onChange,
  onRemove,
}: DimensionChipProps) {
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

  return (
    <WellChip
      drag={{ kind: "dimension", item }}
      rename={item.expression && getFormulaRename(item.expression)}
      onRemove={onRemove}
    >
      {item.bucketOptions.length > 0 ? (
        <DimensionBucketMenu item={item} onSelect={handleBucketSelect}>
          {label}
        </DimensionBucketMenu>
      ) : (
        label
      )}
    </WellChip>
  );
}
