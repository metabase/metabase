import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";

import {
  getColumnGroupIcon,
  getColumnGroupName,
} from "metabase/common/utils/column-groups";
import { getColumnIcon } from "metabase/common/utils/columns";
import {
  QueryColumnInfoIcon,
  HoverParent,
} from "metabase/components/MetadataInfo/ColumnInfoIcon";
import type { ColorName } from "metabase/lib/colors/types";
import type { IconName } from "metabase/ui";
import { Icon, DelayGroup } from "metabase/ui";
import * as Lib from "metabase-lib";

import { BucketPickerPopover } from "./BucketPickerPopover";
import {
  StyledAccordionList,
  NameAndBucketing,
  ItemName,
} from "./QueryColumnPicker.styled";

export type ColumnListItem = Lib.ColumnDisplayInfo & {
  column: Lib.ColumnMetadata;
};

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
  onSelect: (column: Lib.ColumnMetadata) => void;
  onClose?: () => void;
  "data-testid"?: string;
  width?: number | string;
  hasInitialFocus?: boolean;
}

type Sections = {
  name: string;
  items: ColumnListItem[];
  icon?: IconName;
};

export function QueryColumnPicker({
  className,
  query,
  stageIndex,
  columnGroups,
  hasBinning = false,
  hasTemporalBucketing = false,
  withDefaultBucketing = true,
  withInfoIcons = false,
  color = "brand",
  checkIsColumnSelected,
  onSelect,
  onClose,
  "data-testid": dataTestId,
  width,
  hasInitialFocus = true,
}: QueryColumnPickerProps) {
  const sections: Sections[] = useMemo(
    () =>
      columnGroups.map(group => {
        const groupInfo = Lib.displayInfo(query, stageIndex, group);

        const items = Lib.getColumnsFromColumnGroup(group).map(column => ({
          ...Lib.displayInfo(query, stageIndex, column),
          column,
        }));

        return {
          name: getColumnGroupName(groupInfo),
          icon: getColumnGroupIcon(groupInfo),
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

  const renderItemName = useCallback(
    (item: ColumnListItem) => (
      <NameAndBucketing>
        <ItemName>{item.displayName}</ItemName>
        {(hasBinning || hasTemporalBucketing) && (
          <BucketPickerPopover
            query={query}
            stageIndex={stageIndex}
            column={item.column}
            isEditing={checkIsColumnSelected(item)}
            hasBinning={hasBinning}
            hasTemporalBucketing={hasTemporalBucketing}
            hasDot={withInfoIcons}
            hasChevronDown={withInfoIcons}
            color={color}
            onSelect={handleSelect}
          />
        )}
      </NameAndBucketing>
    ),
    [
      query,
      stageIndex,
      hasBinning,
      hasTemporalBucketing,
      color,
      checkIsColumnSelected,
      handleSelect,
      withInfoIcons,
    ],
  );

  const renderItemExtra = useCallback(
    (item: ColumnListItem) => (
      <QueryColumnInfoIcon
        query={query}
        stageIndex={stageIndex}
        column={item.column}
        position="right"
      />
    ),
    [query, stageIndex],
  );

  return (
    <DelayGroup>
      <StyledAccordionList
        className={className}
        sections={sections}
        alwaysExpanded={false}
        onChange={handleSelectColumn}
        itemIsSelected={checkIsColumnSelected}
        renderItemWrapper={renderItemWrapper}
        renderItemName={renderItemName}
        renderItemDescription={omitItemDescription}
        renderItemIcon={renderItemIcon}
        renderItemExtra={renderItemExtra}
        renderItemLabel={renderItemLabel}
        color={color}
        maxHeight={Infinity}
        data-testid={dataTestId}
        searchProp={["name", "displayName"]}
        // Compat with E2E tests around MLv1-based components
        // Prefer using a11y role selectors
        itemTestId="dimension-list-item"
        globalSearch
        hasInitialFocus={hasInitialFocus}
        width={width}
      />
    </DelayGroup>
  );
}

function renderItemLabel(item: ColumnListItem) {
  return item.displayName;
}

function renderItemWrapper(content: ReactNode) {
  return <HoverParent>{content}</HoverParent>;
}

function omitItemDescription() {
  return null;
}

function renderItemIcon(item: ColumnListItem) {
  return <Icon name={getColumnIcon(item.column)} size={18} />;
}
