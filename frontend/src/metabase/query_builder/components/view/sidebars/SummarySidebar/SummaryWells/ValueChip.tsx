import { Ellipsified, FixedSizeIcon } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

import type { SummaryValueItem } from "../types";

import { ColumnValueMenu } from "./ColumnValueMenu";
import { FormulaLabel } from "./FormulaLabel";
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
  onChange: (nextQuery: Lib.Query) => void;
  onRemove: () => void;
};

export function ValueChip({
  query,
  stageIndex,
  item,
  onChange,
  onRemove,
}: ValueChipProps) {
  const handleRename = (name: string) =>
    onChange(
      Lib.replaceClause(
        query,
        stageIndex,
        item.clause,
        Lib.withExpressionName(item.clause, name),
      ),
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
        item.kind === "expression" || item.isNamed
          ? { name: item.label, onRename: handleRename }
          : undefined
      }
      onRemove={onRemove}
    >
      {item.kind === "column" ? (
        <ColumnValueMenu
          query={query}
          stageIndex={stageIndex}
          item={item}
          onChange={onChange}
        />
      ) : (
        <>
          <FixedSizeIcon name={VALUE_ICONS[item.kind]} size={12} />
          {label}
        </>
      )}
    </WellChip>
  );
}
