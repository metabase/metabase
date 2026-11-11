import { Icon } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

import S from "../SummarySidebar.module.css";
import type { SummaryValueItem } from "../types";

import { ColumnValueMenu } from "./ColumnValueMenu";
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
