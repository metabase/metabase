import cx from "classnames";
import type { MouseEvent } from "react";
import { useCallback } from "react";
import { t } from "ttag";

import { BucketPickerPopover } from "metabase/common/components/QueryColumnPicker/BucketPickerPopover";
import {
  HoverParent,
  QueryColumnInfoIcon,
} from "metabase/components/MetadataInfo/ColumnInfoIcon";
import Button from "metabase/core/components/Button";
import Tooltip from "metabase/core/components/Tooltip";
import { Box, type BoxProps, Flex } from "metabase/ui";
import * as Lib from "metabase-lib";

import BreakoutColumnListItemS from "./BreakoutColumnListItem.module.css";

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

const Root = ({
  children,
  isSelected,
  ...props
}: BoxProps & { isSelected?: boolean }) => {
  return (
    <Box
      component="li"
      {...props}
      className={cx(props.className, BreakoutColumnListItemS.Root, {
        [BreakoutColumnListItemS.isSelected]: isSelected,
        [BreakoutColumnListItemS.isNotSelected]: !isSelected,
      })}
    >
      {children}
    </Box>
  );
};

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
      className={BreakoutColumnListItemS.Root}
    >
      <Flex
        className={BreakoutColumnListItemS.Content}
        onClick={handleListItemClick}
      >
        <Flex
          align="center"
          ml="sm"
          p="0.5rem 0"
          className={BreakoutColumnListItemS.TitleContainer}
        >
          <QueryColumnInfoIcon
            className={BreakoutColumnListItemS.ColumnTypeIcon}
            query={query}
            stageIndex={stageIndex}
            column={item.column}
            position="left"
            size={18}
          />
          <Box
            className={BreakoutColumnListItemS.Title}
            data-testid="dimension-list-item-name"
          >
            {displayName}
          </Box>
        </Flex>
        <BucketPickerPopover
          className={BreakoutColumnListItemS.BucketTriggerButton}
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
          <Button
            className={BreakoutColumnListItemS.RemoveButton}
            icon="close"
            onlyIcon
            borderless
            onClick={handleRemoveColumn}
            aria-label={t`Remove dimension`}
          />
        )}
      </Flex>
      {!isSelected && (
        <Tooltip tooltip={t`Add grouping`}>
          <Button
            className={BreakoutColumnListItemS.AddButton}
            icon="add"
            onlyIcon
            borderless
            aria-label={t`Add dimension`}
            onClick={handleAddClick}
          />
        </Tooltip>
      )}
    </HoverParent>
  );
}
