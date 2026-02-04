import cx from "classnames";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  AccordionList,
  type Section as BaseSection,
} from "metabase/common/components/AccordionList";
import {
  HoverParent,
  QueryColumnInfoIcon,
} from "metabase/common/components/MetadataInfo/ColumnInfoIcon";
import { getColumnGroupIcon } from "metabase/common/utils/column-groups";
import { useTranslateContent } from "metabase/i18n/hooks";
import { isNotNull } from "metabase/lib/types";
import {
  type DefinedClauseName,
  clausesForMode,
  getClauseDefinition,
} from "metabase/querying/expressions";
import { WIDTH } from "metabase/querying/filters/components/FilterPicker/constants";
import type {
  ColumnListItem,
  ExpressionClauseItem,
  SegmentListItem,
} from "metabase/querying/filters/components/FilterPicker/types";
import { getGroupName } from "metabase/querying/filters/utils/groups";
import { DelayGroup, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./FilterColumnPicker.module.css";

type Item = ColumnListItem | SegmentListItem | ExpressionClauseItem;

type Section = BaseSection<Item> & {
  key?: string;
};

const SEARCH_PROP = [
  "name",
  "displayName",
  "combinedDisplayName",
  "longDisplayName",
] as const;

export interface FilterColumnPickerProps {
  className?: string;
  query: Lib.Query;
  stageIndexes: number[];
  checkItemIsSelected?: (item: Item) => boolean;
  onColumnSelect: (item: ColumnListItem) => void;
  onSegmentSelect: (item: SegmentListItem) => void;
  onExpressionSelect?: (clause?: DefinedClauseName) => void;

  withCustomExpression?: boolean;
  withColumnGroupIcon?: boolean;
  withColumnItemIcon?: boolean;
}

export const isSegmentListItem = (item: Item): item is SegmentListItem => {
  return (item as SegmentListItem).segment != null;
};

export const isExpressionClauseItem = (
  item: Item,
): item is ExpressionClauseItem => {
  return "type" in item && item.type === "expression-clause";
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
  const tc = useTranslateContent();
  const [searchText, setSearchText] = useState("");
  const isSearching = searchText !== "";

  const sections = useMemo(
    () =>
      getSections({
        query,
        stageIndexes,
        withColumnGroupIcon,
        withCustomExpression,
        isSearching,
        tc,
      }),
    [
      query,
      stageIndexes,
      withColumnGroupIcon,
      withCustomExpression,
      isSearching,
      tc,
    ],
  );

  const renderItemName = useCallback(
    (item: Item) => tc(item.displayName),
    [tc],
  );

  const handleSectionChange = (section: Section) => {
    if (section.key === "custom-expression") {
      onExpressionSelect?.();
    }
  };

  const handleSelect = (item: Item) => {
    if (isSegmentListItem(item)) {
      onSegmentSelect(item);
    } else if (isExpressionClauseItem(item)) {
      onExpressionSelect?.(item.clause);
    } else {
      onColumnSelect(item);
    }
  };

  const handleSearchTextChange = (searchText: string) => {
    setSearchText(searchText);
    if (searchText.trim().endsWith("(")) {
      const name = searchText.trim().slice(0, -1);
      const clause = getClauseDefinition(name);
      if (clause) {
        onExpressionSelect?.(clause.name);
      }
    }
  };

  return (
    <DelayGroup>
      <AccordionList<Item, Section>
        className={cx(S.StyledAccordionList, className)}
        sections={sections}
        onChange={handleSelect}
        onChangeSection={handleSectionChange}
        onChangeSearchText={handleSearchTextChange}
        itemIsSelected={checkItemIsSelected}
        renderItemWrapper={renderItemWrapper}
        renderItemName={renderItemName}
        renderItemDescription={omitDescription}
        renderItemIcon={(item) =>
          withColumnItemIcon ? renderItemIcon(query, item) : null
        }
        // disable scrollbars inside the list
        width={WIDTH}
        maxHeight={Infinity}
        // Compat with E2E tests around MLv1-based components
        // Prefer using a11y role selectors
        itemTestId="dimension-list-item"
        searchProp={SEARCH_PROP}
        globalSearch
      />
    </DelayGroup>
  );
}

function getSections({
  query,
  stageIndexes,
  withColumnGroupIcon,
  withCustomExpression,
  isSearching,
  tc,
}: {
  query: Lib.Query;
  stageIndexes: number[];
  withColumnGroupIcon: boolean;
  withCustomExpression: boolean;
  isSearching: boolean;
  tc: (content: string | null | undefined) => string | null | undefined;
}): Section[] {
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
          combinedName: `${columnInfo.table?.name ?? ""} ${columnInfo.name}`,
          combinedDisplayName: `${columnInfo.table?.displayName ?? ""} ${columnInfo.displayName}`,
          longDisplayName: columnInfo.longDisplayName,
        };
      });
      const segments = groupInfo.isSourceTable
        ? Lib.availableSegments(query, stageIndex)
        : [];
      const segmentItems = segments.map((segment) => {
        const segmentInfo = Lib.displayInfo(query, stageIndex, segment);
        return {
          ...segmentInfo,
          segment,
          stageIndex,
        };
      });

      return {
        name: tc(
          withMultipleStages
            ? getGroupName(groupInfo, stageIndex)
            : groupInfo.displayName,
        ),
        icon: withColumnGroupIcon ? getColumnGroupIcon(groupInfo) : null,
        items: [...segmentItems, ...columnItems],
      };
    });
  });

  const expressionClausesSection = {
    key: "expression-clauses",
    name: t`Custom Expressions`,
    icon: "function" as const,
    items: clausesForMode("filter").map((clause) => ({
      type: "expression-clause" as const,
      clause: clause.name,
      displayName: clause.displayName,
    })),
    alwaysSortLast: true,
  };
  const expressionClauseAction = {
    key: "custom-expression",
    type: "action" as const,
    name: t`Custom Expression`,
    items: [],
    icon: "filter" as const,
    alwaysSortLast: true,
  };

  return [
    ...columnSections,
    withCustomExpression && isSearching ? expressionClausesSection : null,
    withCustomExpression ? expressionClauseAction : null,
  ].filter(isNotNull);
}

function renderItemIcon(query: Lib.Query, item: Item) {
  if (isSegmentListItem(item)) {
    return <Icon name="star" size={18} />;
  } else if (isExpressionClauseItem(item)) {
    return <Icon name="function" size={18} />;
  } else {
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

function omitDescription() {
  return undefined;
}
