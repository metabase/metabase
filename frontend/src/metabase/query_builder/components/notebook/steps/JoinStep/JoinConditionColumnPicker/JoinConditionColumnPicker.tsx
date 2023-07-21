import { forwardRef } from "react";
import { t } from "ttag";

import { Flex, Text } from "metabase/ui";
import IconButtonWrapper from "metabase/components/IconButtonWrapper/IconButtonWrapper";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import {
  QueryColumnPickerProps,
  ColumnListItem,
} from "metabase/common/components/QueryColumnPicker";

import * as Lib from "metabase-lib";

import {
  JoinConditionCellItem,
  StyledQueryColumnPicker,
  RemoveIcon,
} from "./JoinConditionColumnPicker.styled";

interface JoinConditionColumnPickerProps
  extends Omit<QueryColumnPickerProps, "checkIsColumnSelected"> {
  column?: Lib.ColumnMetadata;
  label?: string;
  isInitiallyVisible?: boolean;
  readOnly?: boolean;
  color: string;
  onRemove: () => void;
}

function checkIsColumnSelected(item: ColumnListItem) {
  return !!item.selected;
}

export function JoinConditionColumnPicker({
  query,
  stageIndex,
  column,
  label,
  isInitiallyVisible = false,
  readOnly = false,
  color,
  onRemove,
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
          onRemove={onRemove}
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
  onRemove: () => void;
}

const ColumnNotebookCellItem = forwardRef<
  HTMLDivElement,
  ColumnNotebookCellItemProps
>(function ColumnNotebookCellItem(
  { tableName, columnName, readOnly, onRemove, ...props },
  ref,
) {
  const canRemove = Boolean(columnName && !readOnly);

  const handleRemoveClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    onRemove();
  };

  return (
    <JoinConditionCellItem {...props} ref={ref}>
      <Flex align="center">
        <Flex direction="column" gap="2px">
          {!!tableName && (
            <Text display="block" size={11} lh={1} color="white" opacity={0.65}>
              {tableName}
            </Text>
          )}
          <Text display="block" lh={1}>
            {columnName || t`Pick a column…`}
          </Text>
        </Flex>
        {canRemove && (
          <Flex align="center" ml="12px">
            <IconButtonWrapper
              onClick={handleRemoveClick}
              aria-label={t`Remove`}
            >
              <RemoveIcon name="close" />
            </IconButtonWrapper>
          </Flex>
        )}
      </Flex>
    </JoinConditionCellItem>
  );
});
