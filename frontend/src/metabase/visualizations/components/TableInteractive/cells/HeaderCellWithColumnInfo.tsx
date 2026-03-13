import type React from "react";
import { memo, useMemo } from "react";
import { t } from "ttag";

import { QueryColumnInfoPopover } from "metabase/common/components/MetadataInfo/ColumnInfoPopover";
import {
  HeaderCellPill,
  type HeaderCellProps,
  HeaderCellWrapper,
} from "metabase/data-grid";
import { ActionIcon, Icon, type MantineTheme } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DatasetColumn } from "metabase-types/api";

import S from "./HeaderCellWithColumnInfo.module.css";

export interface HeaderCellWithColumnInfoProps extends HeaderCellProps {
  getInfoPopoversDisabled: () => boolean;
  timezone?: string;
  question: Question;
  column: DatasetColumn;
  columnIndex: number;
  theme: MantineTheme;
  className?: string;
  renderTableHeader?: (
    column: DatasetColumn,
    index: number,
    theme: MantineTheme,
  ) => React.ReactNode;
  onHideColumn?: (columnId: string) => void;
  columnId?: string;
}

export const HeaderCellWithColumnInfo = memo(
  function HeaderCellWithColumnInfoInner({
    name,
    align,
    sort,
    variant = "light",
    getInfoPopoversDisabled,
    question,
    timezone,
    column,
    columnIndex,
    theme,
    className,
    renderTableHeader,
    onHideColumn,
    columnId,
  }: HeaderCellWithColumnInfoProps) {
    const headerCellOverride = useMemo(() => {
      return renderTableHeader != null
        ? renderTableHeader(column, columnIndex, theme)
        : null;
    }, [renderTableHeader, column, columnIndex, theme]);

    const cellContent = (
      <div className={S.headerPillWrapper}>
        {headerCellOverride != null ? (
          headerCellOverride
        ) : (
          <HeaderCellPill name={name} sort={sort} align={align} />
        )}
      </div>
    );

    let headerContent: React.ReactNode;

    if (getInfoPopoversDisabled()) {
      headerContent = cellContent;
    } else {
      // question.query will throw when used in the visualizer
      // we don't go down this code path in the visualizer because isDashboard is true
      const query = question?.query();
      const stageIndex = -1;
      headerContent = (
        <QueryColumnInfoPopover
          position="bottom-start"
          query={query}
          stageIndex={stageIndex}
          column={query && Lib.fromLegacyColumn(query, stageIndex, column)}
          timezone={timezone}
          openDelay={500}
          showFingerprintInfo
        >
          {cellContent}
        </QueryColumnInfoPopover>
      );
    }

    return (
      <HeaderCellWrapper className={className} variant={variant} align={align}>
        {headerContent}
        {onHideColumn && columnId && (
          <ActionIcon
            size="xs"
            className={S.hideButton}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onHideColumn(columnId);
            }}
            aria-label={t`Hide column`}
          >
            <Icon name="eye_crossed_out" size={12} />
          </ActionIcon>
        )}
      </HeaderCellWrapper>
    );
  },
);
