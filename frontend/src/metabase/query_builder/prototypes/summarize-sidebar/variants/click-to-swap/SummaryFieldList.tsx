import { useDraggable } from "@dnd-kit/core";
import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import {
  ActionIcon,
  Box,
  Card,
  Flex,
  Icon,
  Tabs,
  Text,
  TextInput,
} from "metabase/ui";
import { isMac } from "metabase/utils/browser";
import * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

import type {
  SummaryBase,
  SummaryDragItem,
} from "../../../../components/view/SummarySidebar/types";
import {
  getAvailableMetrics,
  getColumnLabel,
  getColumnSections,
  getItemKey,
  getMetricLabel,
} from "../../../../components/view/SummarySidebar/utils";

import { MatchedLabel } from "./MatchedLabel";
import S from "./SummarySidebar.module.css";

type FieldListTab = "columns" | "metrics";

/** A field in the list: a column, a metric, or the count, but never a chip from a well. */
export type SummaryFieldItem = Exclude<SummaryDragItem, { kind: "chip" }>;

type SummaryFieldListProps = {
  base: SummaryBase;
  /** A field was clicked, or picked with Enter or Space. */
  onSwap: (item: SummaryFieldItem) => void;
  /** A field was option-clicked (alt-clicked off a Mac), or picked with that key and Enter or Space. */
  onAdd: (item: SummaryFieldItem) => void;
};

/**
 * The summarized question's columns and the metrics defined on the same table, in tabs, to click or
 * drag into the wells. The search button in the header swaps the tabs for a search across both.
 */
export function SummaryFieldList({
  base,
  onSwap,
  onAdd,
}: SummaryFieldListProps) {
  const [tab, setTab] = useState<FieldListTab>("columns");
  const [isSearching, setIsSearching] = useState(false);
  const [searchText, setSearchText] = useState("");
  const query = isSearching ? searchText : "";

  const sections = useMemo(() => getColumnSections(base, query), [base, query]);
  const metrics = useMemo(
    () => getAvailableMetrics(base, query),
    [base, query],
  );

  const closeSearch = () => {
    setIsSearching(false);
    setSearchText("");
  };

  const columnGroups = sections.map((section) => (
    <Box key={section.name}>
      <Text className={S.fieldGroupName}>{section.name}</Text>
      {section.columns.map((column) => (
        <DraggableField
          key={getItemKey(base, column)}
          id={`summary-column:${getItemKey(base, column)}`}
          icon={getColumnIcon(column)}
          item={{ kind: "column", column, label: getColumnLabel(base, column) }}
          query={query}
          onSwap={onSwap}
          onAdd={onAdd}
        />
      ))}
    </Box>
  ));
  const metricItems = metrics.map((metric) => (
    <DraggableField
      key={getItemKey(base, metric)}
      id={`summary-metric:${getItemKey(base, metric)}`}
      icon="metric"
      item={{ kind: "metric", metric, label: getMetricLabel(base, metric) }}
      description={
        Lib.displayInfo(base.query, base.stageIndex, metric).description
      }
      query={query}
      onSwap={onSwap}
      onAdd={onAdd}
    />
  ));
  const hasColumns = sections.some((section) => section.columns.length > 0);
  const countLabel = t`Count of rows`;
  // pinned above the columns: the quickest value to start a summary with
  const countItem = countLabel
    .toLowerCase()
    .includes(query.trim().toLowerCase()) ? (
    <DraggableField
      id="summary-count"
      icon="sum"
      item={{ kind: "count", label: countLabel }}
      query={query}
      onSwap={onSwap}
      onAdd={onAdd}
    />
  ) : null;

  return (
    <Card className={S.fieldListCard} radius="lg" shadow="xs_outline" p="md">
      <Tabs<FieldListTab>
        className={S.fieldList}
        variant="pills"
        size="sm"
        value={tab}
        onChange={(value) => setTab(value ?? "columns")}
      >
        <Flex className={S.fieldListHeader}>
          {isSearching ? (
            <TextInput
              className={S.fieldListSearch}
              classNames={{ input: S.fieldListSearchInput }}
              size="xs"
              autoFocus
              placeholder={t`Search columns and metrics…`}
              aria-label={t`Search columns and metrics`}
              leftSection={<Icon name="search" />}
              value={searchText}
              onChange={(event) => setSearchText(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  closeSearch();
                }
              }}
              // an empty search has nothing to keep around once focus leaves it
              onBlur={() => {
                if (searchText.length === 0) {
                  closeSearch();
                }
              }}
            />
          ) : (
            <Tabs.List className={S.fieldListTabs}>
              <Tabs.Tab value="columns" leftSection={<Icon name="table" />}>
                {t`Columns`}
              </Tabs.Tab>
              <Tabs.Tab value="metrics" leftSection={<Icon name="metric" />}>
                {/* the half-width card has no room for "Associated metrics" and its count */}
                {t`Metrics`}
              </Tabs.Tab>
            </Tabs.List>
          )}
          <ActionIcon
            className={S.searchToggle}
            // as tall as the search field, so the header keeps its height in both modes
            size={32}
            aria-label={
              isSearching ? t`Close search` : t`Search columns and metrics`
            }
            data-searching={isSearching}
            // keep focus in the field, so an empty search isn't closed by the blur and then reopened
            onMouseDown={(event) => event.preventDefault()}
            onClick={isSearching ? closeSearch : () => setIsSearching(true)}
          >
            <Icon name="search" className={S.searchToggleSearch} aria-hidden />
            <Icon name="close" className={S.searchToggleClose} aria-hidden />
          </ActionIcon>
        </Flex>
        <Box className={S.fieldListScroll}>
          {isSearching ? (
            countItem != null || metrics.length > 0 || hasColumns ? (
              <>
                {countItem}
                {metrics.length > 0 && (
                  <Box>
                    <Text className={S.fieldGroupName}>
                      {t`Associated metrics`}
                    </Text>
                    {metricItems}
                  </Box>
                )}
                {columnGroups}
              </>
            ) : (
              <Text className={S.fieldListEmpty} c="text-secondary">
                {t`Nothing matches “${searchText.trim()}”.`}
              </Text>
            )
          ) : tab === "columns" ? (
            <>
              {countItem}
              {columnGroups}
            </>
          ) : metrics.length > 0 ? (
            metricItems
          ) : (
            <Text className={S.fieldListEmpty} c="text-secondary">
              {t`No metrics are connected to this data yet.`}
            </Text>
          )}
        </Box>
        <Text className={S.fieldListHint}>
          {t`Click to swap, ${isMac() ? "⌥" : "Alt"}-click to add`}
        </Text>
      </Tabs>
    </Card>
  );
}

type DraggableFieldProps = {
  id: string;
  icon: IconName;
  item: SummaryFieldItem;
  description?: string;
  /** Search text to highlight in the label. */
  query: string;
  onSwap: (item: SummaryFieldItem) => void;
  onAdd: (item: SummaryFieldItem) => void;
};

function DraggableField({
  id,
  icon,
  item,
  description,
  query,
  onSwap,
  onAdd,
}: DraggableFieldProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: item,
  });

  return (
    <Box
      ref={setNodeRef}
      className={cx(S.fieldItem, { [S.isDragging]: isDragging })}
      data-testid="summary-field-item"
      {...attributes}
      {...listeners}
      // a drag that ends here doesn't click: dnd-kit swallows the click once a drag starts
      onClick={(event) => (event.altKey ? onAdd(item) : onSwap(item))}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (event.altKey) {
            onAdd(item);
          } else {
            onSwap(item);
          }
        }
      }}
    >
      <Icon name={icon} c="text-secondary" aria-hidden />
      <Box miw={0}>
        <MatchedLabel label={item.label} query={query} />
        {description && (
          <Text size="sm" c="text-secondary" truncate>
            {description}
          </Text>
        )}
      </Box>
      <Icon name="grabber" className={S.grabber} aria-hidden />
    </Box>
  );
}
