import type { TooltipProps } from "metabase/ui";
import type { ColumnSettings } from "metabase-types/api";

import { PreviousValueComparisonTooltip } from "./PreviousValueComparisonTooltip";
import S from "./TrendComparisonPanel.module.css";
import type { ComparisonResult } from "./compute";

export const COMPARISON_PANEL_TOOLTIP_PROPS = {
  position: "bottom",
  classNames: { tooltip: S.comparisonPanel },
} satisfies Partial<TooltipProps>;

interface TrendComparisonPanelProps {
  comparisons: ComparisonResult[];
  formatOptions: ColumnSettings;
}

export function TrendComparisonPanel({
  comparisons,
  formatOptions,
}: TrendComparisonPanelProps) {
  return (
    <div className={S.comparisonTable}>
      {comparisons.map((comparison, index) => (
        <PreviousValueComparisonTooltip
          key={index}
          comparison={comparison}
          formatOptions={formatOptions}
          className={S.comparisonRow}
        />
      ))}
    </div>
  );
}
