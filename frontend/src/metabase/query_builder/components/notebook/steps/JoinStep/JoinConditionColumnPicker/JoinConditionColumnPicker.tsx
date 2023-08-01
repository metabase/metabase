import { forwardRef, RefObject } from "react";
import { t } from "ttag";

import { Flex, Text } from "metabase/ui";
import TippyPopoverWithTrigger, {
  TippyPopoverWithTriggerRef,
} from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import {
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
  column?: Lib.ColumnMetadata;
  label?: string;
  isInitiallyVisible?: boolean;
  readOnly?: boolean;
  color: string;
  popoverRef?: RefObject<TippyPopoverWithTriggerRef>;
}

function checkIsColumnSelected(item: ColumnListItem) {
  return !!item.selected;
}

export type JoinConditionColumnPickerRef = TippyPopoverWithTriggerRef;

export function JoinConditionColumnPicker({
  query,
  stageIndex,
  column,
  label,
  isInitiallyVisible = false,
  readOnly = false,
  color,
  popoverRef,
  ...props
}: JoinConditionColumnPickerProps) {
  const columnInfo = column ? Lib.displayInfo(query, stageIndex, column) : null;

  return (
    <TippyPopoverWithTrigger
      isInitiallyVisible={isInitiallyVisible}
      renderTrigger={({ onClick }) => (
        <ColumnNotebookCellItem
          tableName={columnInfo?.table?.displayName}
          columnName={columnInfo?.displayName}
          aria-label={label}
          inactive={!column}
          readOnly={readOnly}
          color={color}
          onClick={onClick}
        />
      )}
      popoverContent={({ closePopover }) => (
        <StyledQueryColumnPicker
          {...props}
          query={query}
          stageIndex={stageIndex}
          hasTemporalBucketing
          checkIsColumnSelected={checkIsColumnSelected}
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
  color: string;
  inactive: boolean;
  readOnly?: boolean;
  onClick: () => void;
}

const ColumnNotebookCellItem = forwardRef<
  HTMLDivElement,
  ColumnNotebookCellItemProps
>(function ColumnNotebookCellItem({ tableName, columnName, ...props }, ref) {
  return (
    <JoinConditionCellItem {...props} ref={ref}>
      <Flex direction="column" gap="2px">
        {Boolean(tableName || columnName) && (
          <Text display="block" size={11} lh={1} color="white" opacity={0.65}>
            {tableName || t`Previous results`}
          </Text>
        )}
        <Text display="block" lh={1}>
          {columnName || t`Pick a column…`}
        </Text>
      </Flex>
    </JoinConditionCellItem>
  );
});
