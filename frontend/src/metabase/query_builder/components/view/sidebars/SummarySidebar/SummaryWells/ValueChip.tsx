import { Icon } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

import S from "../SummarySidebar.module.css";
import type { SummaryValueItem } from "../types";

import { ColumnValueMenu } from "./ColumnValueMenu";
import { FormulaChip } from "./FormulaChip";
import { WellChip } from "./WellChip";

const VALUE_ICONS: Record<
  Exclude<SummaryValueItem["kind"], "column" | "expression">,
  IconName
> = {
  count: "sum",
  metric: "metric",
  measure: "ruler",
};

type ValueChipProps = {
  query: Lib.Query;
  stageIndex: number;
  item: SummaryValueItem;
  onChange: (nextQuery: Lib.Query) => void;
  onRemove: () => void;
  onFocusInput: () => void;
};

export function ValueChip({
  query,
  stageIndex,
  item,
  onChange,
  onRemove,
  onFocusInput,
}: ValueChipProps) {
  if (item.kind === "expression") {
    return (
      <FormulaChip
        drag={{ kind: "value", item }}
        onRemove={onRemove}
        onFocusInput={onFocusInput}
        onRename={(name) =>
          onChange(
            Lib.replaceClause(
              query,
              stageIndex,
              item.clause,
              Lib.withExpressionName(item.clause, name),
            ),
          )
        }
      />
    );
  }

  return (
    <WellChip drag={{ kind: "value", item }} onRemove={onRemove}>
      {item.kind === "column" ? (
        <ColumnValueMenu
          query={query}
          stageIndex={stageIndex}
          item={item}
          onChange={onChange}
        />
      ) : (
        <>
          <Icon name={VALUE_ICONS[item.kind]} size={12} />
          <span className={S.chipLabel}>{item.label}</span>
        </>
      )}
    </WellChip>
  );
}
