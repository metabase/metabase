import React, { useCallback, useMemo } from "react";

import AccordionList from "metabase/core/components/AccordionList";
import { getColumnIcon } from "metabase/common/utils/columns";
import Icon from "metabase/components/Icon";
import { singularize } from "metabase/lib/formatting";

import * as Lib from "metabase-lib";

import BinningStrategyPickerPopover from "./BinningStrategyPickerPopover";
import TemporalBucketPickerPopover from "./TemporalBucketPickerPopover";

const DEFAULT_MAX_HEIGHT = 610;

interface QueryColumnPickerProps {
  className?: string;
  query: Lib.Query;
  columnGroups: Lib.ColumnGroup[];
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
  columnGroups,
  maxHeight = DEFAULT_MAX_HEIGHT,
  onSelect,
  onClose,
}: QueryColumnPickerProps) {
  const sections: Sections[] = useMemo(
    () =>
      columnGroups.map(group => {
        const groupInfo = Lib.displayInfo(query, group);

        const items = Lib.getColumnsFromColumnGroup(group).map(column => {
          const displayInfo = Lib.displayInfo(query, column);
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
    [query, columnGroups],
  );

  const handleSelect = useCallback(
    (item: ColumnListItem) => {
      onSelect(item.column);
      onClose?.();
    },
    [onSelect, onClose],
  );

  const renderItemExtra = useCallback(
    item => {
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
              onSelect(Lib.withBinning(item.column, nextBucket));
              onClose?.();
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
              onSelect(Lib.withTemporalBucket(item.column, nextBucket));
              onClose?.();
            }}
          />
        );
      }

      return null;
    },
    [query, onSelect, onClose],
  );

  return (
    <AccordionList
      className={className}
      sections={sections}
      maxHeight={maxHeight}
      alwaysExpanded={false}
      onChange={handleSelect}
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
