import type React from "react";
import { memo } from "react";

import { QueryColumnInfoPopover } from "metabase/components/MetadataInfo/ColumnInfoPopover";
import { useMousePressed } from "metabase/hooks/use-mouse-pressed";
import type { MantineTheme } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DatasetColumn } from "metabase-types/api";

import {
  HeaderCellPill,
  HeaderCellProps,
  HeaderCellWrapper,
} from "metabase/data-grid";

import S from "./HeaderCellWithColumnInfo.module.css";

export interface HeaderCellWithColumnInfoProps extends HeaderCellProps {
  infoPopoversDisabled: boolean;
  timezone?: string;
  question: Question;
  column: DatasetColumn;
  columnIndex: number;
  theme: MantineTheme;
  renderTableHeaderWrapper: (
    content: React.ReactNode,
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
    infoPopoversDisabled,
    question,
    timezone,
    column,
    columnIndex,
    theme,
    renderTableHeaderWrapper,
  }: HeaderCellWithColumnInfoProps) {
    const isMousePressed = useMousePressed();
    const query = question?.query();
    const stageIndex = -1;

    return (
      <HeaderCellWrapper variant={variant} align={align}>
        <QueryColumnInfoPopover
          position="bottom-start"
          query={query}
          stageIndex={-1}
          column={query && Lib.fromLegacyColumn(query, stageIndex, column)}
          timezone={timezone}
          disabled={infoPopoversDisabled || isMousePressed}
          openDelay={500}
          showFingerprintInfo
        >
          <div className={S.headerPillWrapper}>
            {renderTableHeaderWrapper != null ? (
              renderTableHeaderWrapper(
                <HeaderCellPill name={name} sort={sort} align={align} />,
                column,
                columnIndex,
                theme,
              )
            ) : (
              <HeaderCellPill name={name} sort={sort} align={align} />
            )}
          </div>
        </QueryColumnInfoPopover>
      </HeaderCellWrapper>
    );
  },
);
