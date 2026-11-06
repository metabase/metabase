import cx from "classnames";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  type PrototypeFilterUsage,
  useListPrototypeFilterUsageQuery,
} from "metabase/api";
import {
  AccordionList,
  type Section as BaseSection,
} from "metabase/common/components/AccordionList";
import {
  HoverParent,
  QueryColumnInfoIcon,
} from "metabase/common/components/MetadataInfo/QueryColumnInfoIcon";
import { useLocale } from "metabase/common/hooks";
import { getColumnGroupIcon } from "metabase/common/utils/column-groups";
import { modelIconMap } from "metabase/common/utils/icon";
import { useTranslateContent } from "metabase/content-translation/hooks";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/content-translation/plugins";
import {
  clausesForMode,
  getClauseDefinition,
} from "metabase/querying/expressions";
import { getGroupName } from "metabase/querying/filters/utils/groups";
import { DelayGroup, Icon } from "metabase/ui";
import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";

import { WIDTH } from "../constants";
import type {
  ColumnListItem,
  ExpressionClauseItem,
  SegmentListItem,
} from "../types";

import S from "./FilterColumnPicker.module.css";

type Item = ColumnListItem | SegmentListItem | ExpressionClauseItem;

// Prototype: an item of the "Frequently used" section shows the table of its column.
type FrequentColumnListItem = ColumnListItem & { tableDisplayName: string };

const FREQUENTLY_USED_LIMIT = 10;

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
  onExpressionSelect?: (clause?: Lib.DefinedClauseName) => void;

  withCustomExpression?: boolean;
  withColumnGroupIcon?: boolean;
  withColumnItemIcon?: boolean;
}

export const isSegmentListItem = (item: Item): item is SegmentListItem => {
  // Unjustified type cast. FIXME
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
  const { locale } = useLocale();
  const [searchText, setSearchText] = useState("");
  const isSearching = searchText !== "";
  const { data: filterUsage } = useListPrototypeFilterUsageQuery();

  const sections = useMemo(
    () =>
      getSections({
        query,
        stageIndexes,
        withColumnGroupIcon,
        withCustomExpression,
        isSearching,
        filterUsage,
        tc,
      }),
    [
      query,
      stageIndexes,
      withColumnGroupIcon,
      withCustomExpression,
      isSearching,
      filterUsage,
      tc,
    ],
  );

  const renderItemName = useCallback(
    (item: Item) => {
      const name = searchText
        ? // When searching, show the untranslated display name to match the search text
          item.displayName
        : PLUGIN_CONTENT_TRANSLATION.translateColumnDisplayName({
            displayName: item.displayName,
            tc,
            locale,
          });
      return isFrequentColumnListItem(item) ? (
        <span className={S.FrequentItemName}>
          {name}
          <span className={S.FrequentItemSeparator} />
          <span className={S.FrequentItemTableName}>
            {item.tableDisplayName}
          </span>
        </span>
      ) : (
        name
      );
    },
    [tc, locale, searchText],
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
        // Prototype: the usage stats load after the first render. Mount the list again when they
        // load, so that it opens the "Frequently used" section.
        key={filterUsage ? "with-filter-usage" : "without-filter-usage"}
        className={cx(S.StyledAccordionList, className)}
        sections={sections}
        onChange={handleSelect}
        onChangeSection={handleSectionChange}
        onChangeSearchText={handleSearchTextChange}
        itemIsSelected={checkItemIsSelected}
        renderItemWrapper={renderItemWrapper}
        renderItemName={renderItemName}
        renderItemLabel={renderItemLabel}
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
  filterUsage,
  tc,
}: {
  query: Lib.Query;
  stageIndexes: number[];
  withColumnGroupIcon: boolean;
  withCustomExpression: boolean;
  isSearching: boolean;
  filterUsage: PrototypeFilterUsage[] | undefined;
  tc: (content: string | null | undefined) => string | null | undefined;
}): Section[] {
  const withMultipleStages = stageIndexes.length > 1;
  const groupedColumnItems: FrequentColumnListItem[] = [];
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
      const groupName = tc(
        withMultipleStages
          ? getGroupName(groupInfo, stageIndex)
          : groupInfo.displayName,
      );
      groupedColumnItems.push(
        ...columnItems.map((item) => ({
          ...item,
          tableDisplayName: groupName ?? "",
        })),
      );
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
        name: groupName,
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

  const frequentlyUsedSection =
    filterUsage && !isSearching
      ? getFrequentlyUsedSection(query, groupedColumnItems, filterUsage)
      : null;

  return [
    frequentlyUsedSection,
    ...columnSections,
    withCustomExpression && isSearching ? expressionClausesSection : null,
    withCustomExpression ? expressionClauseAction : null,
  ].filter(isNotNull);
}

// Prototype: the columns that saved questions filter on most often, by the ratio of
// questions that filter on the column to questions that use its table.
function getFrequentlyUsedSection(
  query: Lib.Query,
  columnItems: FrequentColumnListItem[],
  filterUsage: PrototypeFilterUsage[],
): Section | null {
  const ratioByFieldId = new Map(
    filterUsage.map((usage) => [usage.field_id, usage.ratio]),
  );
  const seenKeys = new Set<string>();
  const items = columnItems
    .flatMap((item) => {
      const { fieldId } = Lib.fieldValuesSearchInfo(query, item.column);
      const ratio = fieldId !== null ? ratioByFieldId.get(fieldId) : undefined;
      const key = `${fieldId}:${item.tableDisplayName}`;
      if (ratio === undefined || seenKeys.has(key)) {
        return [];
      }
      seenKeys.add(key);
      return [{ item, ratio }];
    })
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, FREQUENTLY_USED_LIMIT)
    .map(({ item }) => item);

  if (items.length === 0) {
    return null;
  }

  return {
    key: "frequently-used",
    name: t`Frequently used`,
    icon: "star",
    items,
  };
}

function isFrequentColumnListItem(item: Item): item is FrequentColumnListItem {
  return (
    "tableDisplayName" in item && typeof item.tableDisplayName === "string"
  );
}

function renderItemLabel(item: Item) {
  return item.displayName;
}

function omitDescription() {
  return undefined;
}

function renderItemIcon(query: Lib.Query, item: Item) {
  if (isSegmentListItem(item)) {
    return <Icon name={modelIconMap["segment"]} size={18} />;
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
