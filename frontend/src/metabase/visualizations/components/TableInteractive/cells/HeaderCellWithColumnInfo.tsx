import type React from "react";
import { memo, useMemo, useState } from "react";
import { t } from "ttag";

import { InlineRenameInput } from "metabase/common/components/InlineRenameInput";
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
  /** Double-clicking the name edits it in place; omitted, the name isn't editable. */
  onRename?: (name: string) => void;
  /** Called as editing starts, e.g. to close the popover the double-click's clicks opened. */
  onRenameStart?: () => void;
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
    onRename,
    onRenameStart,
  }: HeaderCellWithColumnInfoProps) {
    const { infoPopoversDisabled } = useTableInteractiveContext();
    const [isRenaming, setIsRenaming] = useState(false);

    const headerCellOverride = useMemo(() => {
      return renderTableHeader != null
        ? renderTableHeader(column, columnIndex, theme)
        : null;
    }, [renderTableHeader, column, columnIndex, theme]);

    const canRename = onRename != null && headerCellOverride == null;
    const displayName = typeof name === "string" ? name : "";

    if (isRenaming && onRename != null) {
      return (
        <HeaderCellWrapper
          className={className}
          variant={variant}
          align={align}
        >
          <div className={S.headerPillWrapper}>
            <div className={S.renamePill}>
              <InlineRenameInput
                initialValue={displayName}
                aria-label={t`Column name`}
                onCommit={(nextName) => {
                  setIsRenaming(false);
                  if (nextName !== displayName) {
                    onRename(nextName);
                  }
                }}
                onCancel={() => setIsRenaming(false)}
              />
            </div>
          </div>
        </HeaderCellWrapper>
      );
    }

    const cellContent = (
      <div
        className={S.headerPillWrapper}
        onDoubleClick={
          canRename
            ? () => {
                onRenameStart?.();
                setIsRenaming(true);
              }
            : undefined
        }
      >
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
      </HeaderCellWrapper>
    );
  },
);
