import cx from "classnames";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  // stageIndex: number;
  checkItemIsSelected: (item: ColumnListItem | SegmentListItem) => boolean;
  onColumnSelect: (column: Lib.ColumnMetadata, stageIndex: number) => void;
  onSegmentSelect: (segment: Lib.SegmentMetadata, stageIndex: number) => void;
  onExpressionSelect: () => void;

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
  name: t`Custom Expression`,
  items: [],
  icon: "filter",
};

export const isSegmentListItem = (
  item: ColumnListItem | SegmentListItem,
): item is SegmentListItem => {
  return (item as SegmentListItem).segment != null;
};

export const limit = {
  isLimited: false,
};

/**
 * Select a column, segment, or custom expression upon which to filter
 * Filter ColumnOrSegmentOrCustomExpressionPicker was too long of a name
 */
export function FilterColumnPicker({
  className,
  query: query2,
  // stageIndex,
  checkItemIsSelected,
  onColumnSelect,
  onSegmentSelect,
  onExpressionSelect,
  withCustomExpression = true,
  withColumnGroupIcon = true,
  withColumnItemIcon = true,
}: FilterColumnPickerProps) {
  const query = useMemo(() => /* Lib.ensureFilterStage */ query2, [query2]);
  const [x, setX] = useState(0);

  const callback = useCallback(() => {
    setTimeout(() => {
      setX(x => x + 1);
    });
  }, []);

  const handleKeyDown = useCallback(
    event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
        callback();
      }
    },
    [callback],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  const sections = useMemo(() => {
    const realStageCount = Lib.stageCount(Lib.dropEmptyStages(query));
    const stageCount = Lib.stageCount(query);
    const max = stageCount === realStageCount ? stageCount - 1 : realStageCount;

    const sections = Lib.stageIndexes(query).flatMap(stageIndex => {
      if (limit.isLimited && stageIndex !== 0 && stageIndex < max) {
        return [];
      }

      const columns = Lib.filterableColumns(query, stageIndex);
      const columnGroups = Lib.groupColumns(columns);

      const sections = columnGroups.map(group => {
        const groupInfo = Lib.displayInfo(query, stageIndex, group);

        const columnItems = Lib.getColumnsFromColumnGroup(group).map(
          column => ({
            ...Lib.displayInfo(query, stageIndex, column),
            column,
            query,
            stageIndex,
          }),
        );

        const includeSegments = groupInfo.isSourceTable;

        const segmentItems = includeSegments
          ? Lib.availableSegments(query, stageIndex).map(segment => ({
              ...Lib.displayInfo(query, stageIndex, segment),
              segment,
            }))
          : [];

        return {
          name:
            limit.isLimited && stageIndex === realStageCount
              ? t`Result columns`
              : getGroupName(groupInfo, stageIndex),
          stageIndex,
          icon: withColumnGroupIcon ? getColumnGroupIcon(groupInfo) : null,
          items: [...segmentItems, ...columnItems],
        };
      });

      return sections;
    });

    return [
      ...sections,
      ...(withCustomExpression ? [CUSTOM_EXPRESSION_SECTION] : []),
    ];
  }, [query, withColumnGroupIcon, withCustomExpression, x]);

  const handleSectionChange = (section: Section) => {
    if (section.key === "custom-expression") {
      onExpressionSelect();
    }
  };

  const handleSelect = (item: ColumnListItem | SegmentListItem) => {
    if (isSegmentListItem(item)) {
      onSegmentSelect(item.segment, item.stageIndex);
    } else {
      onColumnSelect(item.column, item.stageIndex);
    }
  };

  return (
    <DelayGroup data-asd={x}>
      <AccordionList
        className={cx(S.StyledAccordionList, className)}
        sections={sections}
        onChange={handleSelect}
        onChangeSection={handleSectionChange}
        itemIsSelected={checkItemIsSelected}
        renderItemWrapper={renderItemWrapper}
        renderItemName={renderItemName}
        renderItemDescription={omitItemDescription}
        renderItemIcon={(item: ColumnListItem | SegmentListItem) =>
          withColumnItemIcon ? renderItemIcon(item) : null
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
