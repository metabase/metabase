import React, { useCallback, useMemo } from "react";

import AccordionList from "metabase/core/components/AccordionList";
import { getColumnIcon } from "metabase/common/utils/columns";
import Icon from "metabase/components/Icon";
import { singularize } from "metabase/lib/formatting";

import * as Lib from "metabase-lib";

import { BinningStrategyPickerPopover } from "./BinningStrategyPickerPopover";
import { TemporalBucketPickerPopover } from "./TemporalBucketPickerPopover";

const DEFAULT_MAX_HEIGHT = 610;

export interface QueryColumnPickerProps {
  className?: string;
  query: Lib.Query;
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
        const groupInfo = Lib.displayInfo(query, group);

        const items = Lib.getColumnsFromColumnGroup(group).map(column =>
          getColumnListItem(query, column, { hasBucketing }),
        );

        return {
          name: getGroupName(groupInfo),
          icon: getGroupIcon(groupInfo),
          items,
        };
      }),
    [query, columnGroups, hasBucketing],
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
      const isSameColumn =
        clause && Lib.isClauseColumn(query, clause, item.column);
      if (isSameColumn) {
        onClose?.();
      } else {
        handleSelect(item.column);
      }
    },
    [query, clause, handleSelect, onClose],
  );

  const checkIsItemSelected = useCallback(
    (item: ColumnListItem) =>
      clause && Lib.isClauseColumn(query, clause, item.column),
    [query, clause],
  );

  const renderItemExtra = useCallback(
    (item: ColumnListItem) => {
      if (!hasBucketing) {
        return null;
      }

      const binningStrategies = Lib.availableBinningStrategies(
        query,
        item.column,
      );

      if (binningStrategies.length > 0) {
        const selectedBucket = clause ? Lib.binning(clause) : null;
        return (
          <BinningStrategyPickerPopover
            query={query}
            selectedBucket={selectedBucket}
            buckets={binningStrategies}
            withDefaultBucket={!clause}
            onSelect={nextBucket => {
              handleSelect(Lib.withBinning(item.column, nextBucket));
            }}
          />
        );
      }

      const temporalBuckets = Lib.availableTemporalBuckets(query, item.column);

      if (temporalBuckets.length > 0) {
        const selectedBucket = clause ? Lib.temporalBucket(clause) : null;
        return (
          <TemporalBucketPickerPopover
            query={query}
            selectedBucket={selectedBucket}
            buckets={temporalBuckets}
            withDefaultBucket={!clause}
            onSelect={nextBucket => {
              handleSelect(Lib.withTemporalBucket(item.column, nextBucket));
            }}
          />
        );
      }

      return null;
    },
    [query, clause, hasBucketing, handleSelect],
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

function getColumnListItem(
  query: Lib.Query,
  column: Lib.ColumnMetadata,
  { hasBucketing = false } = {},
) {
  const displayInfo = Lib.displayInfo(query, column);

  const binningStrategies = Lib.availableBinningStrategies(query, column);
  const temporalBuckets = Lib.availableTemporalBuckets(query, column);

  if (hasBucketing && binningStrategies.length > 0) {
    const defaultBucket = binningStrategies.find(
      bucket => Lib.displayInfo(query, bucket).default,
    );
    return {
      ...displayInfo,
      column: defaultBucket ? Lib.withBinning(column, defaultBucket) : column,
    };
  }

  if (hasBucketing && temporalBuckets.length > 0) {
    const defaultBucket = temporalBuckets.find(
      bucket => Lib.displayInfo(query, bucket).default,
    );
    return {
      ...displayInfo,
      column: defaultBucket
        ? Lib.withTemporalBucket(column, defaultBucket)
        : column,
    };
  }

  return { ...displayInfo, column };
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QueryColumnPicker;
