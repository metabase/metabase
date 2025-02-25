import { QueryColumnInfoPopover } from "metabase/components/MetadataInfo/ColumnInfoPopover";
import {
  HeaderCellPill,
  HeaderCellProps,
  HeaderCellWrapper,
} from "../../Table";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { DatasetColumn } from "metabase-types/api";
import { memo } from "react";
import S from "./HeaderCellWithColumnInfo.module.css";
import { useMousePressed } from "metabase/hooks/use-mouse-pressed";

export interface HeaderCellWithColumnInfoProps extends HeaderCellProps {
  tabIndex?: number;
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
    tabIndex,
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
            <HeaderCellPill tabIndex={tabIndex} name={name} sort={sort} />
          </div>
        </QueryColumnInfoPopover>
      </HeaderCellWrapper>
    );
  },
);
