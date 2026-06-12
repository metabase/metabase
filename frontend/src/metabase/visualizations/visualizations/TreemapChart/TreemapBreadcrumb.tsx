import { t } from "ttag";

import { Box, Icon, Title } from "metabase/ui";

import S from "./TreemapBreadcrumb.module.css";

interface TreemapBreadcrumbProps {
  groupLabel: string | null;
  value: string;
  onBackClick: () => void;
}

export function TreemapBreadcrumb({
  groupLabel,
  value,
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
      </div>
    </Box>
  );
}
