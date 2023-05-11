import { useCallback, useMemo } from "react";

import AccordionList from "metabase/core/components/AccordionList";
import { getColumnIcon } from "metabase/common/utils/columns";
import Icon from "metabase/components/Icon";
import { singularize } from "metabase/lib/formatting";

import * as Lib from "metabase-lib";

import BinningStrategyPickerPopover from "./BinningStrategyPickerPopover";
import TemporalBucketPickerPopover from "./TemporalBucketPickerPopover";

const DEFAULT_MAX_HEIGHT = 610;

export interface QueryColumnPickerProps {
  className?: string;
  query: Lib.Query;
  stageIndex: number;
  clause?: Lib.Clause;
  columnGroups: Lib.ColumnGroup[];
  hasBucketing?: boolean;
  maxHeight?: number;
  onSelect: (column: Lib.ColumnMetadata) => void;
  onClose?: () => void;
}

type ColumnListItem = Lib.ColumnDisplayInfo & {
  column: Lib.ColumnMetadata;
};

type Sections = {
  name: string;
  items: ColumnListItem[];
  icon?: string;
};

function QueryColumnPicker({
  className,
  query,
  stageIndex,
  clause,
  columnGroups,
  hasBucketing = false,
  maxHeight = DEFAULT_MAX_HEIGHT,
  onSelect,
  onClose,
}: QueryColumnPickerProps) {
  const sections: Sections[] = useMemo(
    () =>
      columnGroups.map(group => {
        const groupInfo = Lib.displayInfo(query, stageIndex, group);

        const items = Lib.getColumnsFromColumnGroup(group).map(column => {
          const displayInfo = Lib.displayInfo(query, stageIndex, column);
          return {
            ...displayInfo,
            column,
          };
        });

        return {
          name: getGroupName(groupInfo),
          icon: getGroupIcon(groupInfo),
          items,
        };
      }),
    [query, stageIndex, columnGroups],
  );

  const handleSelect = useCallback(
    (column: Lib.ColumnMetadata) => {
      onSelect(column);
      onClose?.();
    },
    [onSelect, onClose],
  );

  const handleSelectColumn = useCallback(
    (item: ColumnListItem) => {
      handleSelect(item.column);
    },
    [handleSelect],
  );

  const checkIsItemSelected = useCallback(
    (item: ColumnListItem) =>
      clause && Lib.isClauseColumn(query, clause, item.column),
    [query, clause],
  );

  const renderItemExtra = useCallback(
    item => {
      if (!hasBucketing) {
        return false;
      }

      const binningStrategies = Lib.availableBinningStrategies(
        query,
        item.column,
      );

      if (binningStrategies.length > 0) {
        return (
          <BinningStrategyPickerPopover
            query={query}
            selectedBucket={Lib.binning(query, item.column)}
            buckets={binningStrategies}
            onSelect={nextBucket => {
              handleSelect(Lib.withBinning(item.column, nextBucket));
            }}
          />
        );
      }

      const temporalBuckets = Lib.availableTemporalBuckets(query, item.column);

      if (temporalBuckets.length > 0) {
        return (
          <TemporalBucketPickerPopover
            query={query}
            selectedBucket={Lib.temporalBucket(query, item.column)}
            buckets={temporalBuckets}
            onSelect={nextBucket => {
              handleSelect(Lib.withTemporalBucket(item.column, nextBucket));
            }}
          />
        );
      }

      return null;
    },
    [query, hasBucketing, handleSelect],
  );

  return (
    <AccordionList
      className={className}
      sections={sections}
      maxHeight={maxHeight}
      alwaysExpanded={false}
      onChange={handleSelectColumn}
      itemIsSelected={checkIsItemSelected}
      renderItemName={renderItemName}
      renderItemDescription={omitItemDescription}
      renderItemIcon={renderItemIcon}
      renderItemExtra={renderItemExtra}
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

function getGroupName(groupInfo: Lib.ColumnDisplayInfo | Lib.TableDisplayInfo) {
  const columnInfo = groupInfo as Lib.ColumnDisplayInfo;
  const tableInfo = groupInfo as Lib.TableDisplayInfo;
  return columnInfo.fkReferenceName || singularize(tableInfo.displayName);
}

function getGroupIcon(groupInfo: Lib.ColumnDisplayInfo | Lib.TableDisplayInfo) {
  if ((groupInfo as Lib.TableDisplayInfo).isSourceTable) {
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
