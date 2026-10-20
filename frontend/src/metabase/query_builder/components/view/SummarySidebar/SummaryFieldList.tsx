import { useDraggable } from "@dnd-kit/core";
import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import {
  ActionIcon,
  Badge,
  Box,
  Card,
  Flex,
  Icon,
  Tabs,
  Text,
  TextInput,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

import { MatchedLabel } from "./MatchedLabel";
import S from "./SummarySidebar.module.css";
import type { SummaryBase, SummaryDragItem } from "./types";
import {
  getAvailableMetrics,
  getColumnLabel,
  getColumnSections,
  getItemKey,
  getMetricLabel,
} from "./utils";

type FieldListTab = "columns" | "metrics";

// a translucent dark disc, so the count stays legible on the brand-filled selected pill
const INVERSE_BADGE_PROPS = {
  bg: "background_surface-secondary-hover",
  c: "text-primary-inverse",
} as const;

type SummaryFieldListProps = {
  base: SummaryBase;
};

/**
 * Draggable source fields: the summarized question's columns and the metrics defined on the same
 * table, in tabs. The search button in the header swaps the tabs for a search across both.
 */
export function SummaryFieldList({ base }: SummaryFieldListProps) {
  const [tab, setTab] = useState<FieldListTab>("columns");
  const [isSearching, setIsSearching] = useState(false);
  const [searchText, setSearchText] = useState("");
  const query = isSearching ? searchText : "";

  const sections = useMemo(() => getColumnSections(base, query), [base, query]);
  const metrics = useMemo(
    () => getAvailableMetrics(base, query),
    [base, query],
  );
  const metricCount = useMemo(
    () => getAvailableMetrics(base, "").length,
    [base],
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
              <Tabs.Tab
                value="metrics"
                leftSection={<Icon name="metric" />}
                rightSection={
                  <Badge
                    variant="light"
                    color="neutral"
                    size="sm"
                    {...(tab === "metrics" ? INVERSE_BADGE_PROPS : {})}
                  >
                    {metricCount}
                  </Badge>
                }
              >
                {t`Associated metrics`}
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
      </Tabs>
    </Card>
  );
}

type DraggableFieldProps = {
  id: string;
  icon: IconName;
  item: SummaryDragItem;
  description?: string;
  /** Search text to highlight in the label. */
  query: string;
};

function DraggableField({
  id,
  icon,
  item,
  description,
  query,
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
