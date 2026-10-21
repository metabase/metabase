import { useDraggable } from "@dnd-kit/core";
import cx from "classnames";
import { type ReactNode, useMemo, useState } from "react";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import { Box, Icon, Tabs, Text, TextInput } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

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

type SummaryFieldListProps = {
  base: SummaryBase;
  className?: string;
  /** Shown above the column sections, e.g. the helper columns. */
  leadingSection?: ReactNode;
  /** Columns left out of the sections, by item key, because `leadingSection` lists them. */
  hiddenColumnKeys?: ReadonlySet<string>;
};

/** Draggable source fields: the summarized question's columns and the metrics defined on the same table. */
export function SummaryFieldList({
  base,
  className,
  leadingSection,
  hiddenColumnKeys,
}: SummaryFieldListProps) {
  const [tab, setTab] = useState<FieldListTab>("columns");
  const [searchText, setSearchText] = useState("");

  const sections = useMemo(
    () =>
      getColumnSections(base, searchText)
        .map((section) => ({
          ...section,
          columns: section.columns.filter(
            (column) => !hiddenColumnKeys?.has(getItemKey(base, column)),
          ),
        }))
        .filter((section) => section.columns.length > 0),
    [base, searchText, hiddenColumnKeys],
  );
  const allMetrics = useMemo(() => getAvailableMetrics(base, ""), [base]);
  const metrics = useMemo(
    () => getAvailableMetrics(base, searchText),
    [base, searchText],
  );

  return (
    <Tabs
      className={cx(S.fieldList, className)}
      value={tab}
      onChange={(value) => setTab(value === "metrics" ? "metrics" : "columns")}
    >
      <Tabs.List mb="sm">
        <Tabs.Tab value="columns" leftSection={<Icon name="table" />}>
          {t`Columns`}
        </Tabs.Tab>
        <Tabs.Tab value="metrics" leftSection={<Icon name="metric" />}>
          {t`Associated metrics`} ({allMetrics.length})
        </Tabs.Tab>
      </Tabs.List>
      <TextInput
        mb="sm"
        placeholder={tab === "columns" ? t`Find a column…` : t`Find a metric…`}
        leftSection={<Icon name="search" />}
        value={searchText}
        onChange={(event) => setSearchText(event.currentTarget.value)}
      />
      <Box className={S.fieldListScroll}>
        {tab === "columns" && leadingSection}
        {tab === "columns" ? (
          sections.map((section) => (
            <Box key={section.name}>
              <Text className={S.fieldGroupName}>{section.name}</Text>
              {section.columns.map((column) => (
                <DraggableField
                  key={getItemKey(base, column)}
                  id={`summary-column:${getItemKey(base, column)}`}
                  icon={getColumnIcon(column)}
                  item={{
                    kind: "column",
                    column,
                    label: getColumnLabel(base, column),
                  }}
                />
              ))}
            </Box>
          ))
        ) : metrics.length > 0 ? (
          metrics.map((metric) => (
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
            />
          ))
        ) : (
          <Text c="text-secondary" p="sm">
            {allMetrics.length === 0
              ? t`No metrics are connected to this data yet.`
              : t`No metrics match your search.`}
          </Text>
        )}
      </Box>
    </Tabs>
  );
}

type DraggableFieldProps = {
  id: string;
  icon: IconName;
  item: SummaryDragItem;
  description?: string;
  /** Buttons shown on hover, before the grab handle. */
  actions?: ReactNode;
};

export function DraggableField({
  id,
  icon,
  item,
  description,
  actions,
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
      <Icon name={icon} c="text-secondary" />
      <Box miw={0}>
        <Text truncate>{item.label}</Text>
        {description && (
          <Text size="sm" c="text-secondary" truncate>
            {description}
          </Text>
        )}
      </Box>
      {actions && <Box className={S.fieldActions}>{actions}</Box>}
      <Icon name="grabber" className={S.grabber} />
    </Box>
  );
}
