import { useDraggable } from "@dnd-kit/core";
import cx from "classnames";
import { type ReactNode, useMemo, useState } from "react";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import { Box, Card, Icon, Text, TextInput, UnstyledButton } from "metabase/ui";
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

const METRICS_SECTION_KEY = "metrics";

type SummaryFieldListProps = {
  base: SummaryBase;
};

/**
 * Draggable source fields in one list: a Metrics section (Count of rows, then the metrics defined
 * on the same table), then a section per table the question reaches. Every section collapses; a
 * search shows all matches.
 */
export function SummaryFieldList({ base }: SummaryFieldListProps) {
  const [searchText, setSearchText] = useState("");
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const query = searchText.trim();
  const isSearching = query.length > 0;

  const sections = useMemo(() => getColumnSections(base, query), [base, query]);
  const metrics = useMemo(
    () => getAvailableMetrics(base, query),
    [base, query],
  );

  const toggleSection = (key: string) => {
    setCollapsedKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      if (nextKeys.has(key)) {
        nextKeys.delete(key);
      } else {
        nextKeys.add(key);
      }
      return nextKeys;
    });
  };
  const renderSection = (key: string, name: string, items: ReactNode[]) => (
    <CollapsibleSection
      key={key}
      name={name}
      // matches would be hidden in a collapsed section, so a search opens them all
      isExpanded={isSearching || !collapsedKeys.has(key)}
      onToggle={isSearching ? undefined : () => toggleSection(key)}
    >
      {items}
    </CollapsibleSection>
  );

  const countLabel = t`Count of rows`;
  const isCountMatching = countLabel
    .toLowerCase()
    .includes(query.toLowerCase());
  // Count of rows leads the metrics: the quickest value to start a summary with
  const metricItems = [
    ...(isCountMatching
      ? [
          <DraggableField
            key="count"
            id="summary-count"
            icon="sum"
            item={{ kind: "count", label: countLabel }}
            query={query}
          />,
        ]
      : []),
    ...metrics.map((metric) => (
      <DraggableField
        key={getItemKey(base, metric)}
        id={`summary-metric:${getItemKey(base, metric)}`}
        icon="metric"
        item={{
          kind: "metric",
          metric,
          label: getMetricLabel(base, metric),
        }}
        description={
          Lib.displayInfo(base.query, base.stageIndex, metric).description
        }
        query={query}
      />
    )),
  ];
  const metricsSection =
    metricItems.length > 0
      ? renderSection(METRICS_SECTION_KEY, t`Metrics`, metricItems)
      : null;
  const columnSections = sections
    .filter((section) => section.columns.length > 0)
    .map((section) =>
      renderSection(
        `table:${section.name}`,
        section.name,
        section.columns.map((column) => (
          <DraggableField
            key={getItemKey(base, column)}
            id={`summary-column:${getItemKey(base, column)}`}
            icon={getColumnIcon(column)}
            item={{
              kind: "column",
              column,
              label: getColumnLabel(base, column),
            }}
            query={query}
          />
        )),
      ),
    );
  const hasItems = metricsSection != null || columnSections.length > 0;

  return (
    <Card className={S.fieldListCard} radius="lg" shadow="xs_outline" p="md">
      <Box className={S.fieldList}>
        <TextInput
          className={S.searchField}
          classNames={{ input: S.fieldListSearchInput }}
          size="xs"
          placeholder={t`Search columns and metrics…`}
          aria-label={t`Search columns and metrics`}
          leftSection={<Icon name="search" />}
          value={searchText}
          onChange={(event) => setSearchText(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setSearchText("");
            }
          }}
        />
        <Box className={S.fieldListScroll}>
          {hasItems ? (
            <>
              {metricsSection}
              {columnSections}
            </>
          ) : (
            <Text className={S.fieldListEmpty} c="text-secondary">
              {t`Nothing matches “${query}”.`}
            </Text>
          )}
        </Box>
      </Box>
    </Card>
  );
}

type CollapsibleSectionProps = {
  name: string;
  isExpanded: boolean;
  /** Absent while the section can't collapse, e.g. during a search. */
  onToggle?: () => void;
  children: ReactNode;
};

function CollapsibleSection({
  name,
  isExpanded,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  return (
    <Box>
      <UnstyledButton
        className={cx(S.fieldGroupName, S.sectionToggle)}
        aria-expanded={isExpanded}
        disabled={onToggle == null}
        onClick={onToggle}
      >
        <Icon
          className={S.sectionChevron}
          name={isExpanded ? "chevrondown" : "chevronright"}
          size={12}
          aria-hidden
        />
        {name}
      </UnstyledButton>
      {isExpanded && children}
    </Box>
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
