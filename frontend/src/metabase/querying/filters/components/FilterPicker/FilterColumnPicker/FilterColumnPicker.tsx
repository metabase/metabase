import cx from "classnames";
import { type ReactNode, useMemo } from "react";
import { t } from "ttag";

import { getColumnGroupIcon } from "metabase/common/utils/column-groups";
import {
  HoverParent,
  QueryColumnInfoIcon,
} from "metabase/components/MetadataInfo/ColumnInfoIcon";
import AccordionList from "metabase/core/components/AccordionList";
import { getGroupName } from "metabase/querying/filters/utils/groups";
import type { IconName } from "metabase/ui";
import { DelayGroup, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";

import { WIDTH } from "../constants";
import type { ColumnListItem, SegmentListItem } from "../types";

import S from "./FilterColumnPicker.module.css";

export interface FilterColumnPickerProps {
  className?: string;
  query: Lib.Query;
  stageIndexes: number[];
  checkItemIsSelected?: (item: ColumnListItem | SegmentListItem) => boolean;
  onColumnSelect: (item: ColumnListItem) => void;
  onSegmentSelect: (item: SegmentListItem) => void;
  onExpressionSelect?: () => void;

  withCustomExpression?: boolean;
  withColumnGroupIcon?: boolean;
  withColumnItemIcon?: boolean;
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
  get name() {
    return t`Custom Expression`;
  },
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
  className,
  query,
  stageIndexes,
  checkItemIsSelected,
  onColumnSelect,
  onSegmentSelect,
  onExpressionSelect,
  withCustomExpression = true,
  withColumnGroupIcon = true,
  withColumnItemIcon = true,
}: FilterColumnPickerProps) {
  const sections = useMemo(
    () =>
      getSections(
        query,
        stageIndexes,
        withColumnGroupIcon,
        withCustomExpression,
      ),
    [query, stageIndexes, withColumnGroupIcon, withCustomExpression],
  );

  const handleSectionChange = (section: Section) => {
    if (section.key === "custom-expression") {
      onExpressionSelect?.();
    }
  };

  const handleSelect = (item: ColumnListItem | SegmentListItem) => {
    if (isSegmentListItem(item)) {
      onSegmentSelect(item);
    } else {
      onColumnSelect(item);
    }
  };

  return (
    <DelayGroup>
      <AccordionList
        className={cx(S.StyledAccordionList, className)}
        sections={sections}
        onChange={handleSelect}
        onChangeSection={handleSectionChange}
        itemIsSelected={checkItemIsSelected}
        renderItemWrapper={renderItemWrapper}
        renderItemName={renderItemName}
        renderItemIcon={(item: ColumnListItem | SegmentListItem) =>
          withColumnItemIcon ? renderItemIcon(query, item) : null
        }
        // disable scrollbars inside the list
        style={{ overflow: "visible", "--accordion-list-width": `${WIDTH}px` }}
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

function getSections(
  query: Lib.Query,
  stageIndexes: number[],
  withColumnGroupIcon: boolean,
  withCustomExpression: boolean,
) {
  const withMultipleStages = stageIndexes.length > 1;
  const columnSections = stageIndexes.flatMap((stageIndex) => {
    const columns = Lib.filterableColumns(query, stageIndex);
    const columnGroups = Lib.groupColumns(columns);

    return columnGroups.map((group) => {
      const groupInfo = Lib.displayInfo(query, stageIndex, group);
      const columnItems = Lib.getColumnsFromColumnGroup(group).map((column) => {
        const columnInfo = Lib.displayInfo(query, stageIndex, column);
        return {
          name: columnInfo.name,
          displayName: columnInfo.displayName,
          filterPositions: columnInfo.filterPositions,
          column,
          query,
          stageIndex,
        };
      });
      const segments = groupInfo.isSourceTable
        ? Lib.availableSegments(query, stageIndex)
        : [];
      const segmentItems = segments.map((segment) => {
        const segmentInfo = Lib.displayInfo(query, stageIndex, segment);
        return {
          name: segmentInfo.name,
          displayName: segmentInfo.displayName,
          filterPositions: segmentInfo.filterPositions,
          segment,
          stageIndex,
        };
      });

      return {
        name: withMultipleStages
          ? getGroupName(groupInfo, stageIndex)
          : groupInfo.displayName,
        icon: withColumnGroupIcon ? getColumnGroupIcon(groupInfo) : null,
        items: [...segmentItems, ...columnItems],
      };
    });
  });

  return [
    ...columnSections,
    ...(withCustomExpression ? [CUSTOM_EXPRESSION_SECTION] : []),
  ];
}

function renderItemName(item: ColumnListItem) {
  return item.displayName;
}

function renderItemIcon(
  query: Lib.Query,
  item: ColumnListItem | SegmentListItem,
) {
  if (isSegmentListItem(item)) {
    return <Icon name="star" size={18} />;
  }

  if (item.column) {
    const { column, stageIndex } = item;
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

function renderItemWrapper(content: ReactNode) {
  return <HoverParent>{content}</HoverParent>;
}
