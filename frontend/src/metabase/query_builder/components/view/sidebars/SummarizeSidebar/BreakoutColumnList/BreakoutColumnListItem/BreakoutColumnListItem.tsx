import type { MouseEvent } from "react";
import { useCallback } from "react";
import { t } from "ttag";

import { BucketPickerPopover } from "metabase/common/components/QueryColumnPicker/BucketPickerPopover";
import { HoverParent } from "metabase/components/MetadataInfo/ColumnInfoIcon";
import Tooltip from "metabase/core/components/Tooltip";
import * as Lib from "metabase-lib";

import {
  AddButton,
  ColumnTypeIcon,
  Content,
  RemoveButton,
  Root,
  Title,
  TitleContainer,
} from "./BreakoutColumnListItem.styled";

interface BreakoutColumnListItemProps {
  query: Lib.Query;
  stageIndex: number;
  item: Lib.ColumnDisplayInfo & { column: Lib.ColumnMetadata };
  breakout?: Lib.BreakoutClause;
  isPinned?: boolean;
  onAddBreakout: (column: Lib.ColumnMetadata) => void;
  onUpdateBreakout: (
    breakout: Lib.BreakoutClause,
    column: Lib.ColumnMetadata,
  ) => void;
  onRemoveBreakout: (breakout: Lib.BreakoutClause) => void;
  onReplaceBreakouts?: (column: Lib.ColumnMetadata) => void;
}

export function BreakoutColumnListItem({
  query,
  stageIndex,
  item,
  breakout,
  isPinned = false,
  onAddBreakout,
  onUpdateBreakout,
  onRemoveBreakout,
  onReplaceBreakouts,
}: BreakoutColumnListItemProps) {
  const isSelected = breakout != null;

  const handleAddClick = useCallback(() => {
    onAddBreakout(Lib.withDefaultBucket(query, stageIndex, item.column));
  }, [query, stageIndex, item.column, onAddBreakout]);

  const handleListItemClick = useCallback(() => {
    onReplaceBreakouts?.(Lib.withDefaultBucket(query, stageIndex, item.column));
  }, [query, stageIndex, item.column, onReplaceBreakouts]);

  const handleRemoveColumn = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      if (breakout) {
        onRemoveBreakout(breakout);
      }
    },
    [breakout, onRemoveBreakout],
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
            breakout
              ? onUpdateBreakout(breakout, column)
              : onAddBreakout(column)
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
