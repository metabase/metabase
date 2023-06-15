import { useCallback, useMemo } from "react";

import AccordionList from "metabase/core/components/AccordionList";
import { getColumnIcon } from "metabase/common/utils/columns";
import { Icon, IconName } from "metabase/core/components/Icon";
import { singularize } from "metabase/lib/formatting";

import * as Types from "metabase-lib";
import { useMetabaseLib } from "metabase-lib/react";

import {
  BinningStrategyPickerPopover,
  TemporalBucketPickerPopover,
} from "./BucketPickerPopover";

const DEFAULT_MAX_HEIGHT = 610;

type ColumnListItem = Types.ColumnDisplayInfo & {
  column: Types.ColumnMetadata;
};

export interface QueryColumnPickerProps {
  className?: string;
  query: Types.Query;
  stageIndex: number;
  columnGroups: Types.ColumnGroup[];
  hasBinning?: boolean;
  hasTemporalBucketing?: boolean;
  maxHeight?: number;
  checkIsColumnSelected: (item: ColumnListItem) => boolean;
  onSelect: (column: Types.ColumnMetadata) => void;
  onClose?: () => void;
}

type Sections = {
  name: string;
  items: ColumnListItem[];
  icon?: IconName;
};

function QueryColumnPicker({
  className,
  query,
  stageIndex,
  columnGroups,
  hasBinning = false,
  hasTemporalBucketing = false,
  maxHeight = DEFAULT_MAX_HEIGHT,
  checkIsColumnSelected,
  onSelect,
  onClose,
}: QueryColumnPickerProps) {
  const Lib = useMetabaseLib(query, stageIndex);

  const sections: Sections[] = useMemo(
    () =>
      columnGroups.map(group => {
        const groupInfo = Lib.displayInfo(group);

        const items = Lib.getColumnsFromColumnGroup(group).map(column => ({
          ...Lib.displayInfo(column),
          column,
        }));

        return {
          name: getGroupName(groupInfo),
          icon: getGroupIcon(groupInfo),
          items,
        };
      }),
    [Lib, columnGroups],
  );

  const handleSelect = useCallback(
    (column: Types.ColumnMetadata) => {
      onSelect(column);
      onClose?.();
    },
    [onSelect, onClose],
  );

  const handleSelectColumn = useCallback(
    (item: ColumnListItem) => {
      const isSameColumn = checkIsColumnSelected(item);

      if (isSameColumn) {
        onClose?.();
        return;
      }

      const isBinned = Lib.binning(item.column) != null;
      const isBinnable = isBinned || Lib.isBinnable(item.column);

      if (hasBinning && isBinnable) {
        const column = isBinned
          ? item.column
          : Lib.withDefaultBinning(item.column);
        handleSelect(column);
        return;
      }

      const isBucketed = Lib.temporalBucket(item.column) != null;
      const isBucketable = isBucketed || Lib.isTemporalBucketable(item.column);

      if (hasTemporalBucketing && isBucketable) {
        const column = isBucketed
          ? item.column
          : Lib.withDefaultTemporalBucket(item.column);
        handleSelect(column);
        return;
      }

      handleSelect(item.column);
    },
    [
      Lib,
      hasBinning,
      hasTemporalBucketing,
      checkIsColumnSelected,
      handleSelect,
      onClose,
    ],
  );

  const renderItemExtra = useCallback(
    (item: ColumnListItem) => {
      if (hasBinning && Lib.isBinnable(item.column)) {
        const buckets = Lib.availableBinningStrategies(item.column);
        const isEditing = checkIsColumnSelected(item);
        return (
          <BinningStrategyPickerPopover
            query={query}
            stageIndex={stageIndex}
            column={item.column}
            buckets={buckets}
            isEditing={isEditing}
            onSelect={handleSelect}
          />
        );
      }

      if (hasTemporalBucketing && Lib.isTemporalBucketable(item.column)) {
        const buckets = Lib.availableTemporalBuckets(item.column);
        const isEditing = checkIsColumnSelected(item);
        return (
          <TemporalBucketPickerPopover
            query={query}
            stageIndex={stageIndex}
            column={item.column}
            buckets={buckets}
            isEditing={isEditing}
            onSelect={handleSelect}
          />
        );
      }

      return null;
    },
    [
      Lib,
      query,
      stageIndex,
      hasBinning,
      hasTemporalBucketing,
      checkIsColumnSelected,
      handleSelect,
    ],
  );

  return (
    <AccordionList
      className={className}
      sections={sections}
      maxHeight={maxHeight}
      alwaysExpanded={false}
      onChange={handleSelectColumn}
      itemIsSelected={checkIsColumnSelected}
      renderItemName={renderItemName}
      renderItemDescription={omitItemDescription}
      renderItemIcon={renderItemIcon}
      renderItemExtra={renderItemExtra}
      // Compat with E2E tests around MLv1-based components
      // Prefer using a11y role selectors
      itemTestId="dimension-list-item"
    />
  );
}

function renderItemName(item: ColumnListItem) {
  return item.displayName;
}

function omitItemDescription() {
  return null;
}

function renderItemIcon(item: ColumnListItem) {
  return <Icon name={getColumnIcon(item.column)} size={18} />;
}

function getGroupName(
  groupInfo: Types.ColumnDisplayInfo | Types.TableDisplayInfo,
) {
  const columnInfo = groupInfo as Types.ColumnDisplayInfo;
  const tableInfo = groupInfo as Types.TableDisplayInfo;
  return columnInfo.fkReferenceName || singularize(tableInfo.displayName);
}

function getGroupIcon(
  groupInfo: Types.ColumnDisplayInfo | Types.TableDisplayInfo,
) {
  if ((groupInfo as Types.TableDisplayInfo).isSourceTable) {
    return "table";
  }
  if (groupInfo.isFromJoin) {
    return "join_left_outer";
  }
  if (groupInfo.isImplicitlyJoinable) {
    return "connections";
  }
  return;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QueryColumnPicker;
