import { forwardRef, useCallback, useMemo } from "react";
import { t } from "ttag";

import type {
  QueryColumnPickerProps,
  ColumnListItem,
} from "metabase/common/components/QueryColumnPicker";
import { Popover, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import {
  JoinConditionCellItem,
  StyledQueryColumnPicker,
} from "./JoinConditionColumnPicker.styled";

interface JoinConditionColumnPickerProps
  extends Omit<QueryColumnPickerProps, "checkIsColumnSelected"> {
  isNewCondition: boolean;
  column?: Lib.ColumnMetadata;
  table?: Lib.Joinable;
  label?: string;
  isOpened: boolean;
  readOnly?: boolean;
  onOpenedChange: (isOpened: boolean) => void;
  "data-testid"?: string;
}

export function JoinConditionColumnPicker({
  query,
  stageIndex,
  column,
  table,
  label,
  isNewCondition,
  isOpened,
  readOnly = false,
  onOpenedChange,
  getColumnGroups,
  ...props
}: Omit<JoinConditionColumnPickerProps, "columnGroups"> & {
  getColumnGroups: () => Lib.ColumnGroup[];
}) {
  const columnInfo = column ? Lib.displayInfo(query, stageIndex, column) : null;

  const tableName = useMemo(() => {
    if (!columnInfo) {
      return;
    }
    if (table) {
      return Lib.displayInfo(query, stageIndex, table).displayName;
    }
    return columnInfo.table?.displayName;
  }, [query, stageIndex, table, columnInfo]);

  const checkColumnSelected = useCallback(
    (item: ColumnListItem) => {
      if (isNewCondition) {
        return false;
      }
      return !!item.selected;
    },
    [isNewCondition],
  );

  return (
    <Popover opened={isOpened} onChange={onOpenedChange}>
      <Popover.Target>
        <ColumnNotebookCellItem
          isOpen={isOpened}
          tableName={tableName}
          columnName={columnInfo?.displayName}
          label={label}
          readOnly={readOnly}
          onClick={() => onOpenedChange(!isOpened)}
        />
      </Popover.Target>
      <Popover.Dropdown>
        <StyledQueryColumnPicker
          {...props}
          query={query}
          columnGroups={isOpened ? getColumnGroups() : []}
          stageIndex={stageIndex}
          hasTemporalBucketing
          checkIsColumnSelected={checkColumnSelected}
          onClose={() => onOpenedChange(false)}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

interface ColumnNotebookCellItemProps {
  tableName?: string;
  columnName?: string;
  label?: string;
  isOpen?: boolean;
  readOnly?: boolean;
  onClick: () => void;
}

const ColumnNotebookCellItem = forwardRef<
  HTMLButtonElement,
  ColumnNotebookCellItemProps
>(function ColumnNotebookCellItem(
  { tableName, columnName, label, isOpen, readOnly, onClick },
  ref,
) {
  const hasColumnSelected = !!columnName;
  const hasTableLabel = !!tableName || hasColumnSelected;
  return (
    <JoinConditionCellItem
      isOpen={isOpen}
      hasColumnSelected={hasColumnSelected}
      aria-label={label}
      disabled={readOnly}
      readOnly={readOnly}
      onClick={onClick}
      ref={ref}
    >
      {hasTableLabel && (
        <Text
          display="block"
          size={11}
          lh={1}
          color="white"
          align="left"
          weight={400}
        >
          {tableName || t`Previous results`}
        </Text>
      )}
      <Text
        display="block"
        color={columnName ? "white" : "brand"}
        align="left"
        weight={700}
        lh={1}
      >
        {columnName || t`Pick a column…`}
      </Text>
    </JoinConditionCellItem>
  );
});
