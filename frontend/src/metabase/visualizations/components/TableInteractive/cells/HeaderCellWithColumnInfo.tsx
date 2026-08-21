import type React from "react";
import { memo, useMemo } from "react";

import { QueryColumnInfoPopover } from "metabase/common/components/MetadataInfo/ColumnInfoPopover";
import {
  HeaderCellPill,
  type HeaderCellProps,
  HeaderCellWrapper,
} from "metabase/data-grid";
import type { MantineTheme } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DatasetColumn } from "metabase-types/api";

import { useTableInteractiveContext } from "../TableInteractiveContext";

import S from "./HeaderCellWithColumnInfo.module.css";

export interface HeaderCellWithColumnInfoProps extends HeaderCellProps {
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
}

export const HeaderCellWithColumnInfo = memo(
  function HeaderCellWithColumnInfoInner({
    name,
    align,
    sort,
    variant = "light",
    question,
    timezone,
    column,
    columnIndex,
    theme,
    className,
    renderTableHeader,
  }: HeaderCellWithColumnInfoProps) {
    const { infoPopoversDisabled } = useTableInteractiveContext();

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

    if (infoPopoversDisabled) {
      headerContent = cellContent;
    } else {
      // question.query will throw when used in the visualizer
      // we don't go down this code path in the visualizer because isDashboard is true
      const query = question?.query();
      const queryInfo = query != null ? Lib.queryDisplayInfo(query) : undefined;
      const stageIndex = -1;
      const columnMetadata =
        query != null &&
        queryInfo != null &&
        (!queryInfo.isNative || column.source === "native")
          ? Lib.fromLegacyColumn(query, stageIndex, column)
          : undefined;

      headerContent =
        columnMetadata != null ? (
          <QueryColumnInfoPopover
            position="bottom-start"
            query={query}
            stageIndex={stageIndex}
            column={columnMetadata}
            timezone={timezone}
            openDelay={500}
            showFingerprintInfo
          >
            {cellContent}
          </QueryColumnInfoPopover>
        ) : (
          cellContent
        );
    }

    return (
      <HeaderCellWrapper className={className} variant={variant} align={align}>
        {headerContent}
      </HeaderCellWrapper>
    );
  },
);
