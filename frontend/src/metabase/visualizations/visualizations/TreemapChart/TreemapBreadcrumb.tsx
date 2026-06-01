import { t } from "ttag";

import S from "./TreemapBreadcrumb.module.css";

interface TreemapBreadcrumbProps {
  groupLabel: string;
  onAllClick: () => void;
}

/**
 * Floating breadcrumb shown over a drilled-in treemap (replaces ECharts' native
 * breadcrumb, which is hidden in option.ts). The treemap is at most two levels
 * deep, so the path is always "All / <group>": "All" navigates back to the
 * overview, the group label is the current location.
 */
export function TreemapBreadcrumb({
  groupLabel,
  onAllClick,
}: TreemapBreadcrumbProps) {
  return (
    <div className={S.breadcrumb} data-testid="treemap-breadcrumb">
      <button type="button" className={S.root} onClick={onAllClick}>
        {t`All`}
      </button>
      <span className={S.separator} aria-hidden="true">
        /
      </span>
      <span className={S.group}>{groupLabel}</span>
    </div>
  );
}
