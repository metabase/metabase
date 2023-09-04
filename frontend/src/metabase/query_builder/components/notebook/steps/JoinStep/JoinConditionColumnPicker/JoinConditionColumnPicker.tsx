import { forwardRef, useCallback } from "react";
import type { RefObject } from "react";
import { t } from "ttag";

import { Text } from "metabase/ui";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import type { TippyPopoverWithTriggerRef } from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import type {
  QueryColumnPickerProps,
  ColumnListItem,
} from "metabase/common/components/QueryColumnPicker";

import * as Lib from "metabase-lib";

import {
  JoinConditionCellItem,
  StyledQueryColumnPicker,
} from "./JoinConditionColumnPicker.styled";

interface JoinConditionColumnPickerProps
  extends Omit<QueryColumnPickerProps, "checkIsColumnSelected"> {
  isNewCondition: boolean;
  column?: Lib.ColumnMetadata;
  label?: string;
  isInitiallyVisible?: boolean;
  readOnly?: boolean;
  popoverRef?: RefObject<TippyPopoverWithTriggerRef>;
}

export type JoinConditionColumnPickerRef = TippyPopoverWithTriggerRef;

export function JoinConditionColumnPicker({
  query,
  stageIndex,
  column,
  label,
  isNewCondition,
  isInitiallyVisible = false,
  readOnly = false,
  popoverRef,
  ...props
}: JoinConditionColumnPickerProps) {
  const columnInfo = column ? Lib.displayInfo(query, stageIndex, column) : null;

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
    <TippyPopoverWithTrigger
      disabled={readOnly}
      isInitiallyVisible={isInitiallyVisible}
      renderTrigger={({ visible, onClick }) => (
        <ColumnNotebookCellItem
          isOpen={visible}
          tableName={columnInfo?.table?.displayName}
          columnName={columnInfo?.displayName}
          label={label}
          readOnly={readOnly}
          onClick={onClick}
        />
      )}
      popoverContent={({ closePopover }) => (
        <StyledQueryColumnPicker
          {...props}
          query={query}
          stageIndex={stageIndex}
          hasTemporalBucketing
          checkIsColumnSelected={checkColumnSelected}
          onClose={closePopover}
        />
      )}
      popoverRef={popoverRef}
    />
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
