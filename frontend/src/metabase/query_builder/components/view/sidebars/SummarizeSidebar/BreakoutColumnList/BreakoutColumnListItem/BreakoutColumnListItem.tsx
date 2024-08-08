import type { MouseEvent } from "react";
import { useCallback } from "react";
import { t } from "ttag";

import { BucketPickerPopover } from "metabase/common/components/QueryColumnPicker/BucketPickerPopover";
import { HoverParent } from "metabase/components/MetadataInfo/ColumnInfoIcon";
import Tooltip from "metabase/core/components/Tooltip";
import * as Lib from "metabase-lib";

import {
  AddButton,
  Content,
  ColumnTypeIcon,
  Title,
  TitleContainer,
  RemoveButton,
  Root,
} from "./BreakoutColumnListItem.styled";

interface BreakoutColumnListItemProps {
  query: Lib.Query;
  stageIndex: number;
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
  stageIndex,
  item,
  breakout,
  isPinned = false,
  onAddColumn,
  onUpdateColumn,
  onRemoveColumn,
  onReplaceColumns,
}: BreakoutColumnListItemProps) {
  const isSelected = typeof item.breakoutPosition === "number";

  const handleAddClick = useCallback(() => {
    onAddColumn(Lib.withDefaultBucket(query, stageIndex, item.column));
  }, [query, stageIndex, item.column, onAddColumn]);

  const handleListItemClick = useCallback(() => {
    onReplaceColumns?.(Lib.withDefaultBucket(query, stageIndex, item.column));
  }, [query, stageIndex, item.column, onReplaceColumns]);

  const handleRemoveColumn = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      onRemoveColumn(item.column);
    },
    [item.column, onRemoveColumn],
  );

  const displayName = isPinned ? item.longDisplayName : item.displayName;

  return (
    <HoverParent
      as={Root}
      {...{ isSelected }}
      aria-label={displayName}
      aria-selected={isSelected}
      data-testid="dimension-list-item"
    >
      <Content onClick={handleListItemClick}>
        <TitleContainer>
          <ColumnTypeIcon
            query={query}
            stageIndex={stageIndex}
            column={item.column}
            position="left"
            size={18}
          />
          <Title data-testid="dimension-list-item-name">{displayName}</Title>
        </TitleContainer>
        <BucketPickerPopover
          query={query}
          stageIndex={stageIndex}
          column={item.column}
          color="summarize"
          isEditing={isSelected}
          hasChevronDown
          hasBinning
          hasTemporalBucketing
          onSelect={column =>
            breakout ? onUpdateColumn(column) : onAddColumn(column)
          }
        />
        {isSelected && (
          <RemoveButton
            onClick={handleRemoveColumn}
            aria-label={t`Remove dimension`}
          />
        )}
      </Content>
      {!isSelected && (
        <Tooltip tooltip={t`Add grouping`}>
          <AddButton aria-label={t`Add dimension`} onClick={handleAddClick} />
        </Tooltip>
      )}
    </HoverParent>
  );
}
