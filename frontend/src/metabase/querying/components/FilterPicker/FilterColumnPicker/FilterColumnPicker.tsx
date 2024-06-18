import { useMemo } from "react";
import { t } from "ttag";

import {
  getColumnGroupIcon,
  getColumnGroupName,
} from "metabase/common/utils/column-groups";
import {
  QueryColumnInfoIcon,
  HoverParent,
} from "metabase/components/MetadataInfo/ColumnInfoIcon";
import type { IconName } from "metabase/ui";
import { DelayGroup, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { ColumnListItem, SegmentListItem } from "../types";

import { StyledAccordionList } from "./FilterColumnPicker.styled";

export interface FilterColumnPickerProps {
  query: Lib.Query;
  stageIndex: number;
  checkItemIsSelected: (item: ColumnListItem | SegmentListItem) => boolean;
  onColumnSelect: (column: Lib.ColumnMetadata) => void;
  onSegmentSelect: (segment: Lib.SegmentMetadata) => void;
  onExpressionSelect: () => void;
}

type Section = {
  key?: string;
  type: string;
  name: string;
  items: (Lib.ColumnMetadata | Lib.SegmentMetadata)[];
  icon?: IconName;
};

const CUSTOM_EXPRESSION_SECTION: Section = {
  key: "custom-expression",
  type: "action",
  name: t`Custom Expression`,
  items: [],
  icon: "filter",
};

export const isSegmentListItem = (
  item: ColumnListItem | SegmentListItem,
): item is SegmentListItem => {
  return (item as SegmentListItem).segment != null;
};

/**
 * Select a column, segment, or custom expression upon which to filter
 * Filter ColumnOrSegmentOrCustomExpressionPicker was too long of a name
 */
export function FilterColumnPicker({
  query,
  stageIndex,
  checkItemIsSelected,
  onColumnSelect,
  onSegmentSelect,
  onExpressionSelect,
}: FilterColumnPickerProps) {
  const sections = useMemo(() => {
    const columns = Lib.filterableColumns(query, stageIndex);
    const columnGroups = Lib.groupColumns(columns);

    const sections = columnGroups.map(group => {
      const groupInfo = Lib.displayInfo(query, stageIndex, group);

      const columnItems = Lib.getColumnsFromColumnGroup(group).map(column => ({
        ...Lib.displayInfo(query, stageIndex, column),
        column,
        query,
        stageIndex,
      }));

      const includeSegments = groupInfo.isSourceTable;

      const segmentItems = includeSegments
        ? Lib.availableSegments(query, stageIndex).map(segment => ({
            ...Lib.displayInfo(query, stageIndex, segment),
            segment,
          }))
        : [];

      return {
        name: getColumnGroupName(groupInfo),
        icon: getColumnGroupIcon(groupInfo),
        items: [...segmentItems, ...columnItems],
      };
    });

    return [...sections, CUSTOM_EXPRESSION_SECTION];
  }, [query, stageIndex]);

  const handleSectionChange = (section: Section) => {
    if (section.key === "custom-expression") {
      onExpressionSelect();
    }
  };

  const handleSelect = (item: ColumnListItem | SegmentListItem) => {
    if (isSegmentListItem(item)) {
      onSegmentSelect(item.segment);
    } else {
      onColumnSelect(item.column);
    }
  };

  return (
    <DelayGroup>
      <StyledAccordionList
        sections={sections}
        onChange={handleSelect}
        onChangeSection={handleSectionChange}
        itemIsSelected={checkItemIsSelected}
        renderItemWrapper={renderItemWrapper}
        renderItemName={renderItemName}
        renderItemDescription={omitItemDescription}
        renderItemIcon={renderItemIcon}
        // disable scrollbars inside the list
        style={{ overflow: "visible" }}
        maxHeight={Infinity}
        // Compat with E2E tests around MLv1-based components
        // Prefer using a11y role selectors
        itemTestId="dimension-list-item"
        searchProp={["name", "displayName"]}
        globalSearch
        withBorders
      />
    </DelayGroup>
  );
}

function renderItemName(item: ColumnListItem) {
  return item.displayName;
}

function omitItemDescription() {
  return null;
}

function renderItemIcon(item: ColumnListItem | SegmentListItem) {
  if (isSegmentListItem(item)) {
    return <Icon name="star" size={18} />;
  }

  if (item.column) {
    const { query, stageIndex, column } = item;
    return (
      <QueryColumnInfoIcon
        query={query}
        stageIndex={stageIndex}
        column={column}
        position="top-start"
        size={18}
      />
    );
  }
}

function renderItemWrapper(content: React.ReactNode) {
  return <HoverParent>{content}</HoverParent>;
}
