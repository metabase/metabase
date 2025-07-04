import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";

import {
  AccordionList,
  type Section as BaseSection,
} from "metabase/common/components/AccordionList";
import {
  HoverParent,
  QueryColumnInfoIcon,
} from "metabase/common/components/MetadataInfo/ColumnInfoIcon";
import { getColumnGroupIcon } from "metabase/common/utils/column-groups";
import { color } from "metabase/lib/colors";
import type { ColorName } from "metabase/lib/colors/types";
import { DelayGroup } from "metabase/ui";
import * as Lib from "metabase-lib";

import { BucketPickerPopover } from "./BucketPickerPopover";
import S from "./QueryColumnPicker.module.css";

export type ColumnListItem = Lib.ColumnDisplayInfo & {
  column: Lib.ColumnMetadata;
  combinedDisplayName?: string;
};

export type QueryColumnPickerSection = BaseSection<ColumnListItem>;

export interface QueryColumnPickerProps {
  className?: string;
  query: Lib.Query;
  stageIndex: number;
  columnGroups: Lib.ColumnGroup[];
  hasBinning?: boolean;
  hasTemporalBucketing?: boolean;
  withDefaultBucketing?: boolean;
  withInfoIcons?: boolean;
  maxHeight?: number;
  color?: ColorName;
  checkIsColumnSelected: (item: ColumnListItem) => boolean;
  extraSections?: QueryColumnPickerSection[];
  onSelect: (column: Lib.ColumnMetadata) => void;
  onSelectSection?: (section: QueryColumnPickerSection) => void;
  onClose?: () => void;
  "data-testid"?: string;
  width?: string;
  hasInitialFocus?: boolean;
  alwaysExpanded?: boolean;
  disableSearch?: boolean;
}

const SEARCH_PROP = [
  "name",
  "displayName",
  "combinedDisplayName",
  "longDisplayName",
] as const;

export function QueryColumnPicker({
  className,
  query,
  stageIndex,
  columnGroups,
  extraSections,
  hasBinning = false,
  hasTemporalBucketing = false,
  withDefaultBucketing = true,
  withInfoIcons = false,
  color: colorProp = "brand",
  checkIsColumnSelected,
  onSelect,
  onSelectSection,
  onClose,
  width,
  "data-testid": dataTestId,
  hasInitialFocus = true,
  alwaysExpanded,
  disableSearch,
}: QueryColumnPickerProps) {
  const sections: QueryColumnPickerSection[] = useMemo(() => {
    const columnSections = columnGroups.map((group) => {
      const groupInfo = Lib.displayInfo(query, stageIndex, group);

      const items = Lib.getColumnsFromColumnGroup(group).map((column) => {
        const columnInfo = Lib.displayInfo(
          query,
          stageIndex,
          getColumnWithoutBucketing(column, hasTemporalBucketing, hasBinning),
        );
        return {
          ...columnInfo,
          column,
          combinedDisplayName: `${columnInfo.table?.displayName ?? ""} ${columnInfo.displayName}`,
        };
      });

      return {
        name: groupInfo.displayName,
        icon: getColumnGroupIcon(groupInfo),
        items,
      };
    });
    return [...columnSections, ...(extraSections ?? [])];
  }, [
    query,
    stageIndex,
    columnGroups,
    extraSections,
    hasTemporalBucketing,
    hasBinning,
  ]);

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
    (item: ColumnListItem) => {
      const isEditing = checkIsColumnSelected(item);

      return (
        (hasBinning || hasTemporalBucketing) && (
          <BucketPickerPopover
            classNames={{
              root: S.itemWrapper,
              /*
              isEditing controls "selected" state of the item, so if a row is selected, we want to show icon
              otherwise we show chevron down icon only when we hover over a row, to control this behavior
              we pass or not pass chevronDown class, which hides this icon by default
            */
              chevronDown: isEditing ? undefined : S.chevronDown,
            }}
            query={query}
            stageIndex={stageIndex}
            column={item.column}
            isEditing={isEditing}
            hasBinning={hasBinning}
            hasTemporalBucketing={hasTemporalBucketing}
            hasChevronDown={withInfoIcons}
            color={colorProp}
            onSelect={handleSelect}
          />
        )
      );
    },
    [
      query,
      stageIndex,
      checkIsColumnSelected,
      hasBinning,
      hasTemporalBucketing,
      withInfoIcons,
      colorProp,
      handleSelect,
    ],
  );

  const renderItemIcon = useCallback(
    (item: ColumnListItem) => (
      <QueryColumnInfoIcon
        query={query}
        stageIndex={stageIndex}
        column={item.column}
        position="top-start"
      />
    ),
    [query, stageIndex],
  );

  return (
    <DelayGroup>
      <AccordionList<ColumnListItem, QueryColumnPickerSection>
        className={className}
        sections={sections}
        alwaysExpanded={alwaysExpanded}
        onChange={handleSelectColumn}
        onChangeSection={onSelectSection}
        itemIsSelected={checkIsColumnSelected}
        renderItemWrapper={renderItemWrapper}
        renderItemName={renderItemName}
        renderItemExtra={renderItemExtra}
        renderItemDescription={omitItemDescription}
        renderItemIcon={renderItemIcon}
        style={{
          color: color(colorProp),
        }}
        maxHeight={Infinity}
        data-testid={dataTestId}
        searchProp={SEARCH_PROP}
        // Compat with E2E tests around MLv1-based components
        // Prefer using a11y role selectors
        itemTestId="dimension-list-item"
        withBorders
        hasInitialFocus={hasInitialFocus}
        width={width}
        globalSearch={!disableSearch}
        searchable={!disableSearch}
        fuzzySearch
      />
    </DelayGroup>
  );
}

// if there is a separate picker for temporal bucketing or binning,
// we do not want to include it in the column name
function getColumnWithoutBucketing(
  column: Lib.ColumnMetadata,
  hasTemporalBucketing: boolean,
  hasBinning: boolean,
) {
  if (hasTemporalBucketing && Lib.temporalBucket(column) != null) {
    return Lib.withTemporalBucket(column, null);
  }
  if (hasBinning && Lib.binning(column) != null) {
    return Lib.withBinning(column, null);
  }
  return column;
}

function renderItemName(item: ColumnListItem) {
  return item.displayName;
}

function renderItemWrapper(content: ReactNode) {
  return <HoverParent className={S.itemWrapper}>{content}</HoverParent>;
}

function omitItemDescription() {
  return null;
}
