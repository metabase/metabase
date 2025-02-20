import { QueryColumnInfoPopover } from "metabase/components/MetadataInfo/ColumnInfoPopover";
import {
  HeaderCellPill,
  HeaderCellProps,
  HeaderCellWrapper,
} from "../../Table";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { DatasetColumn } from "metabase-types/api";
import { memo, useCallback } from "react";
import S from "./HeaderCellWithColumnInfo.module.css";

export interface HeaderCellWithColumnInfoProps extends HeaderCellProps {
  infoPopoversDisabled: boolean;
  timezone?: string;
  question: Question;
  column: DatasetColumn;
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
    onClick,
  }: HeaderCellWithColumnInfoProps) => {
    const query = question?.query();
    const stageIndex = -1;

    const handleClick = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        onClick?.(event, column?.name);
      },
      [column],
    );

    return (
      <HeaderCellWrapper variant={variant} align={align}>
        <QueryColumnInfoPopover
          position="bottom-start"
          query={query}
          stageIndex={-1}
          column={query && Lib.fromLegacyColumn(query, stageIndex, column)}
          timezone={timezone}
          disabled={infoPopoversDisabled}
          openDelay={500}
          showFingerprintInfo
        >
          <div className={S.headerPillWrapper}>
            <HeaderCellPill name={name} sort={sort} onClick={handleClick} />
          </div>
        </QueryColumnInfoPopover>
      </HeaderCellWrapper>
    );
  },
);
