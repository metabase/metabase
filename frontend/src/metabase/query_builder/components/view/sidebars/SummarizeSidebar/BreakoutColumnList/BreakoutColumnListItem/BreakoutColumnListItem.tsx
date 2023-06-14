import { MouseEvent, useCallback } from "react";
import { t } from "ttag";
import { getColumnIcon } from "metabase/common/utils/columns";
import Tooltip from "metabase/core/components/Tooltip";
import * as Lib from "metabase-lib";
import {
  AddButton,
  BucketPickerPopover,
  Content,
  ColumnTypeIcon,
  Title,
  TitleContainer,
  RemoveButton,
  Root,
} from "./BreakoutColumnListItem.styled";

const STAGE_INDEX = -1;

interface BreakoutColumnListItemProps {
  query: Lib.Query;
  item: Lib.ColumnDisplayInfo & { column: Lib.ColumnMetadata };
  breakout?: Lib.BreakoutClause;
  isPinned?: boolean;
  onAddColumn: (column: Lib.ColumnMetadata) => void;
  onUpdateColumn: (column: Lib.ColumnMetadata) => void;
  onRemoveColumn: (column: Lib.ColumnMetadata) => void;
  onReplaceColumns?: (column: Lib.ColumnMetadata) => void;
}

export function BreakoutColumnListItem({
  query,
  item,
  breakout,
  isPinned = false,
  onAddColumn,
  onUpdateColumn,
  onRemoveColumn,
  onReplaceColumns,
}: BreakoutColumnListItemProps) {
  const isSelected = typeof item.breakoutPosition === "number";

  const handleRemoveColumn = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      onRemoveColumn(item.column);
    },
    [item.column, onRemoveColumn],
  );

  const renderBucketPicker = useCallback(
    () => (
      <BucketPickerPopover
        query={query}
        stageIndex={STAGE_INDEX}
        column={item.column}
        isEditing={isSelected}
        hasArrowIcon={false}
        hasBinning
        hasTemporalBucketing
        onSelect={column =>
          breakout ? onUpdateColumn(column) : onReplaceColumns?.(column)
        }
      />
    ),
    [
      query,
      breakout,
      item.column,
      isSelected,
      onUpdateColumn,
      onReplaceColumns,
    ],
  );

  const displayName = isPinned ? item.longDisplayName : item.displayName;

  return (
    <Root
      aria-label={displayName}
      isSelected={isSelected}
      aria-selected={isSelected}
      data-testid="dimension-list-item"
    >
      <Content onClick={() => onReplaceColumns?.(item.column)}>
        <TitleContainer>
          <ColumnTypeIcon name={getColumnIcon(item.column)} size={18} />
          <Title data-testid="dimension-list-item-name">{displayName}</Title>
        </TitleContainer>
        {renderBucketPicker()}
        {isSelected && (
          <RemoveButton
            onClick={handleRemoveColumn}
            aria-label={t`Remove dimension`}
          />
        )}
      </Content>
      {!isSelected && (
        <Tooltip tooltip={t`Add grouping`}>
          <AddButton
            aria-label={t`Add dimension`}
            onClick={() => onAddColumn(item.column)}
          />
        </Tooltip>
      )}
    </Root>
  );
}
