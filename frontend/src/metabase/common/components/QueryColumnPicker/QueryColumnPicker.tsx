import { useCallback, useMemo } from "react";

import { getColumnIcon } from "metabase/common/utils/columns";
import type { IconName } from "metabase/core/components/Icon";
import { Icon } from "metabase/core/components/Icon";
import { singularize } from "metabase/lib/formatting";
import type { ColorName } from "metabase/lib/colors/types";

import * as Lib from "metabase-lib";

import { BucketPickerPopover } from "./BucketPickerPopover";
import { StyledAccordionList } from "./QueryColumnPicker.styled";

const DEFAULT_MAX_HEIGHT = 610;

export type ColumnListItem = Lib.ColumnDisplayInfo & {
  column: Lib.ColumnMetadata;
};

export type Section<T = ColumnListItem> = {
  key?: string;
  name: string;
  items: T[];
  icon?: IconName;
};

export interface QueryColumnPickerProps {
  className?: string;
  query: Lib.Query;
  stageIndex: number;
  columnGroups: Lib.ColumnGroup[];
  hasBinning?: boolean;
  hasTemporalBucketing?: boolean;
  withDefaultBucketing?: boolean;
  extraSections?: Section[];
  maxHeight?: number;
  color?: ColorName;
  checkIsColumnSelected: (item: ColumnListItem) => boolean;
  onSelect: (column: Lib.ColumnMetadata) => void;
  onChangeSection?: (section: Section) => void;
  onClose?: () => void;
}

export function QueryColumnPicker({
  className,
  query,
  stageIndex,
  columnGroups,
  hasBinning = false,
  hasTemporalBucketing = false,
  withDefaultBucketing = true,
  extraSections = [],
  maxHeight = DEFAULT_MAX_HEIGHT,
  color = "brand",
  checkIsColumnSelected,
  onSelect,
  onChangeSection,
  onClose,
}: QueryColumnPickerProps) {
  const sections: Section[] = useMemo(() => {
    const columnSections = columnGroups.map(group => {
      const groupInfo = Lib.displayInfo(query, stageIndex, group);

      const items = Lib.getColumnsFromColumnGroup(group).map(column => ({
        ...Lib.displayInfo(query, stageIndex, column),
        column,
      }));

      return {
        name: getGroupName(groupInfo),
        icon: getGroupIcon(groupInfo),
        items,
      };
    });

    return [...columnSections, ...extraSections];
  }, [query, stageIndex, columnGroups, extraSections]);

  const handleSelect = useCallback(
    (column: Lib.ColumnMetadata) => {
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

      if (!withDefaultBucketing) {
        handleSelect(item.column);
        return;
      }

      const isBinnable = Lib.isBinnable(query, stageIndex, item.column);
      if (hasBinning && isBinnable) {
        handleSelect(Lib.withDefaultBinning(query, stageIndex, item.column));
        return;
      }

      const isTemporalBucketable = Lib.isTemporalBucketable(
        query,
        stageIndex,
        item.column,
      );
      if (hasTemporalBucketing && isTemporalBucketable) {
        handleSelect(
          Lib.withDefaultTemporalBucket(query, stageIndex, item.column),
        );
        return;
      }

      handleSelect(item.column);
    },
    [
      query,
      stageIndex,
      hasBinning,
      hasTemporalBucketing,
      withDefaultBucketing,
      checkIsColumnSelected,
      handleSelect,
      onClose,
    ],
  );

  const renderItemExtra = useCallback(
    (item: ColumnListItem) =>
      hasBinning || hasTemporalBucketing ? (
        <BucketPickerPopover
          query={query}
          stageIndex={stageIndex}
          column={item.column}
          isEditing={checkIsColumnSelected(item)}
          hasBinning={hasBinning}
          hasTemporalBucketing={hasTemporalBucketing}
          color={color}
          onSelect={handleSelect}
        />
      ) : null,
    [
      query,
      stageIndex,
      hasBinning,
      hasTemporalBucketing,
      color,
      checkIsColumnSelected,
      handleSelect,
    ],
  );

  return (
    <StyledAccordionList
      className={className}
      sections={sections}
      maxHeight={maxHeight}
      alwaysExpanded={false}
      onChange={handleSelectColumn}
      onChangeSection={onChangeSection}
      itemIsSelected={checkIsColumnSelected}
      renderItemName={renderItemName}
      renderItemDescription={omitItemDescription}
      renderItemIcon={renderItemIcon}
      renderItemExtra={renderItemExtra}
      color={color}
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

function getGroupIcon(
  groupInfo: Lib.ColumnDisplayInfo | Lib.TableDisplayInfo,
): IconName | undefined {
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
