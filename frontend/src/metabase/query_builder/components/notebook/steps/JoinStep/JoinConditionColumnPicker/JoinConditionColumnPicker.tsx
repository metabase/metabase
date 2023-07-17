import { forwardRef } from "react";
import { t } from "ttag";

import { Flex, Text } from "metabase/ui";
import IconButtonWrapper from "metabase/components/IconButtonWrapper/IconButtonWrapper";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import { QueryColumnPickerProps } from "metabase/common/components/QueryColumnPicker";

import * as Lib from "metabase-lib";

import { NotebookCellItem } from "../../../NotebookCell";
import {
  StyledQueryColumnPicker,
  RemoveIcon,
} from "./JoinConditionColumnPicker.styled";

interface JoinConditionColumnPickerProps extends QueryColumnPickerProps {
  column?: Lib.ColumnMetadata;
  label?: string;
  readOnly?: boolean;
  color: string;
  onRemove: () => void;
}

export function JoinConditionColumnPicker({
  query,
  stageIndex,
  column,
  label,
  readOnly = false,
  color,
  onRemove,
  ...props
}: JoinConditionColumnPickerProps) {
  const columnInfo = column ? Lib.displayInfo(query, stageIndex, column) : null;

  return (
    <TippyPopoverWithTrigger
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
    <NotebookCellItem {...props} ref={ref}>
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
    </NotebookCellItem>
  );
});
