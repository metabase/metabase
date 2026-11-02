import cx from "classnames";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  type PrototypeFieldCategories,
  type PrototypeFilterUsage,
  useListPrototypeFieldCategoriesQuery,
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
import type { FieldId } from "metabase-types/api";

import { WIDTH } from "../constants";
import type {
  ColumnListItem,
  ExpressionClauseItem,
  SegmentListItem,
} from "../types";

import S from "./FilterColumnPicker.module.css";

type Item = ColumnListItem | SegmentListItem | ExpressionClauseItem;

// Prototype: a sub-header of an LLM field category inside a table section.
type CategoryHeaderItem = {
  type: "category-header";
  name: string;
  displayName: string;
};

// Prototype: a column under a category sub-header, which is indented.
type CategorizedColumnListItem = ColumnListItem & { isCategorized: true };

type PickerItem = Item | CategoryHeaderItem;

type FieldCategory = { name: string; index: number };

// Prototype: an item of the "Frequently used" section shows the table of its column.
type FrequentColumnListItem = ColumnListItem & { tableDisplayName: string };

const FREQUENTLY_USED_LIMIT = 10;

type Section = BaseSection<PickerItem> & {
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

export const isSegmentListItem = (
  item: PickerItem,
): item is SegmentListItem => {
  // Unjustified type cast. FIXME
  return (item as SegmentListItem).segment != null;
};

export const isExpressionClauseItem = (
  item: PickerItem,
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
  const { data: fieldCategories } = useListPrototypeFieldCategoriesQuery();

  const sections = useMemo(
    () =>
      getSections({
        query,
        stageIndexes,
        withColumnGroupIcon,
        withCustomExpression,
        isSearching,
        filterUsage,
        fieldCategories,
        tc,
      }),
    [
      query,
      stageIndexes,
      withColumnGroupIcon,
      withCustomExpression,
      isSearching,
      filterUsage,
      fieldCategories,
      tc,
    ],
  );

  const renderItemName = useCallback(
    (item: PickerItem) => {
      if (isCategoryHeaderItem(item)) {
        return <span className={S.CategoryHeader}>{item.displayName}</span>;
      }
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

  const handleSelect = (item: PickerItem) => {
    if (isCategoryHeaderItem(item)) {
      return;
    } else if (isSegmentListItem(item)) {
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
      <AccordionList<PickerItem, Section>
        // Prototype: the usage stats load after the first render. Mount the list again when they
        // load, so that it opens the "Frequently used" section.
        key={filterUsage ? "with-filter-usage" : "without-filter-usage"}
        className={cx(S.StyledAccordionList, className)}
        sections={sections}
        onChange={handleSelect}
        onChangeSection={handleSectionChange}
        onChangeSearchText={handleSearchTextChange}
        itemIsSelected={(item) =>
          !isCategoryHeaderItem(item) && (checkItemIsSelected?.(item) ?? false)
        }
        itemIsClickable={(item) => !isCategoryHeaderItem(item)}
        getItemClassName={(item) =>
          isCategoryHeaderItem(item)
            ? S.CategoryHeaderItem
            : isCategorizedColumnListItem(item)
              ? S.CategorizedItem
              : undefined
        }
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
  fieldCategories,
  tc,
}: {
  query: Lib.Query;
  stageIndexes: number[];
  withColumnGroupIcon: boolean;
  withCustomExpression: boolean;
  isSearching: boolean;
  filterUsage: PrototypeFilterUsage[] | undefined;
  fieldCategories: PrototypeFieldCategories[] | undefined;
  tc: (content: string | null | undefined) => string | null | undefined;
}): Section[] {
  const withMultipleStages = stageIndexes.length > 1;
  const groupedColumnItems: FrequentColumnListItem[] = [];
  const categoryByFieldId =
    fieldCategories && !isSearching
      ? getCategoryByFieldId(fieldCategories)
      : undefined;
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
        items: [
          ...segmentItems,
          ...(categoryByFieldId
            ? groupColumnItemsByCategory(query, columnItems, categoryByFieldId)
            : columnItems),
        ],
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

function getCategoryByFieldId(
  fieldCategories: PrototypeFieldCategories[],
): Map<FieldId, FieldCategory> {
  return new Map(
    fieldCategories.flatMap(({ categories }) =>
      categories.flatMap(({ name, field_ids }, index) =>
        field_ids.map((fieldId) => [fieldId, { name, index }] as const),
      ),
    ),
  );
}

// Prototype: put a sub-header before the columns of each LLM field category. The
// columns without a category, for example expressions, go into "Other".
function groupColumnItemsByCategory(
  query: Lib.Query,
  columnItems: ColumnListItem[],
  categoryByFieldId: Map<FieldId, FieldCategory>,
): PickerItem[] {
  const categorized = columnItems.map((item) => {
    const { fieldId } = Lib.fieldValuesSearchInfo(query, item.column);
    const category =
      fieldId !== null ? categoryByFieldId.get(fieldId) : undefined;
    return { item, category };
  });
  if (categorized.every(({ category }) => category === undefined)) {
    return columnItems;
  }

  const otherIndex =
    categorized.find(({ category }) => category?.name === "Other")?.category
      ?.index ??
    Math.max(...categorized.map(({ category }) => category?.index ?? 0)) + 1;
  const groups = _.groupBy(
    categorized,
    ({ category }) => category?.index ?? otherIndex,
  );

  return Object.keys(groups)
    .map(Number)
    .sort((a, b) => a - b)
    .flatMap((index) => {
      const group = groups[index];
      const name =
        group.find(({ category }) => category !== undefined)?.category?.name ??
        t`Other`;
      const header: CategoryHeaderItem = {
        type: "category-header",
        name,
        displayName: name,
      };
      return [
        header,
        ...group.map(
          ({ item }): CategorizedColumnListItem => ({
            ...item,
            isCategorized: true,
          }),
        ),
      ];
    });
}

function isCategorizedColumnListItem(
  item: PickerItem,
): item is CategorizedColumnListItem {
  return "isCategorized" in item && item.isCategorized === true;
}

function isCategoryHeaderItem(item: PickerItem): item is CategoryHeaderItem {
  return "type" in item && item.type === "category-header";
}

function isFrequentColumnListItem(
  item: PickerItem,
): item is FrequentColumnListItem {
  return (
    "tableDisplayName" in item && typeof item.tableDisplayName === "string"
  );
}

function renderItemLabel(item: PickerItem) {
  return item.displayName;
}

function omitDescription() {
  return undefined;
}

function renderItemIcon(query: Lib.Query, item: PickerItem) {
  if (isCategoryHeaderItem(item)) {
    return null;
  } else if (isSegmentListItem(item)) {
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
