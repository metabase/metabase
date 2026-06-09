import { t } from "ttag";

import { Box, Icon, Title } from "metabase/ui";

import S from "./TreemapBreadcrumb.module.css";

interface TreemapBreadcrumbProps {
  /** Drilled-in group name, or `null` at the overview (shows "Total"). */
  groupLabel: string | null;
  /** Formatted total for the current view (grand total or the group's value). */
  value: string;
  /** Formatted percentage — the current view is always shown at 100%. */
  percent: string;
  /** Navigate back to the overview (only reachable via the drilled-in arrow). */
  onBackClick: () => void;
}

/**
 * Top bar shown over the treemap (replaces ECharts' native breadcrumb, hidden in
 * option.ts). It always summarises the current view: at the overview the left
 * reads "Total"; once drilled into a group it becomes a back button ("← group")
 * that returns to the overview. The right side shows the current view's total
 * value and percentage (always 100%). See Figma node 193:404 / 193:595.
 */
export function TreemapBreadcrumb({
  groupLabel,
  value,
  percent,
  onBackClick,
}: TreemapBreadcrumbProps) {
  return (
    <Box className={S.breadcrumb} data-testid="treemap-breadcrumb">
      {groupLabel == null ? (
        <Title order={5}>{t`Total`}</Title>
      ) : (
        <button
          type="button"
          className={S.back}
          aria-label={groupLabel}
          onClick={onBackClick}
        >
          <Icon name="arrow_left" size={16} aria-hidden />
          <span>{groupLabel}</span>
        </button>
      )}
      <div className={S.values}>
        <span className={S.value}>{value}</span>
        <span className={S.percent}>{percent}</span>
      </div>
    </Box>
  );
}
