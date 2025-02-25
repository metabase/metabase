import { QueryColumnInfoPopover } from "metabase/components/MetadataInfo/ColumnInfoPopover";
import {
  HeaderCellPill,
  HeaderCellProps,
  HeaderCellWrapper,
} from "../../Table";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { DatasetColumn } from "metabase-types/api";
import React, { memo } from "react";
import S from "./HeaderCellWithColumnInfo.module.css";
import { useMousePressed } from "metabase/hooks/use-mouse-pressed";
import { MantineTheme } from "metabase/ui";

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
  ({
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
  }: HeaderCellWithColumnInfoProps) => {
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
                <HeaderCellPill name={name} sort={sort} />,
                column,
                columnIndex,
                theme,
              )
            ) : (
              <HeaderCellPill name={name} sort={sort} />
            )}
          </div>
        </QueryColumnInfoPopover>
      </HeaderCellWrapper>
    );
  },
);
