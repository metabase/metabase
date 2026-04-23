import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useGetAdhocQueryQuery } from "metabase/api";
import type { DateFilterValue } from "metabase/querying/common/types";
import { Card, Skeleton, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type { ClickActionsMode } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import type { VisualizationDisplay } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import { VIEW_CONVERSATIONS } from "../../constants";
import { useAuditTable } from "../../hooks/useAuditTable";

import S from "./ChartCard.module.css";
import {
  type UsageStatsMetric,
  applyDateFilter,
  applyUsageStatsAggregation,
  findColumn,
  getMetricSeriesSettings,
} from "./query-utils";

type Props = {
  dateFilter: DateFilterValue;
  breakoutColumn: string;
  title: string;
  display?: VisualizationDisplay;
  metric: UsageStatsMetric;
  viewName?: string;
  onDimensionClick?: (value: unknown) => void;
  h?: number;
  nullLabel?: string;
  maxCategories?: number;
};

// When a custom click handler is provided, we need visualizationIsClickable
// to return true. This mode satisfies that check; the action is never executed
// because handleVisualizationClick short-circuits first.
const CLICKABLE_MODE: ClickActionsMode = {
  actionsForClick: () => [{ name: "custom-click" } as any],
};

export function BreakoutChart({
  dateFilter,
  breakoutColumn,
  title,
  display = "row",
  metric,
  viewName = VIEW_CONVERSATIONS,
  onDimensionClick,
  h = 350,
  nullLabel,
  maxCategories = 8,
}: Props) {
  const otherLabel = t`Other`;
  const { provider, table } = useAuditTable(viewName);

  const query = useMemo(() => {
    if (!provider || !table) {
      return null;
    }
    let q = Lib.queryFromTableOrCardMetadata(provider, table);

    q = applyDateFilter(q, dateFilter);
    const { query: aggregated, orderColumnName } = applyUsageStatsAggregation(
      q,
      metric,
    );
    q = aggregated;

    const col = findColumn(q, breakoutColumn, Lib.breakoutableColumns);
    if (col) {
      q = Lib.breakout(q, 0, col);
    }

    if (orderColumnName) {
      const orderCol = findColumn(q, orderColumnName, Lib.orderableColumns);
      if (orderCol) {
        q = Lib.orderBy(q, 0, orderCol, "desc");
      }
    }

    return q;
  }, [provider, table, dateFilter, breakoutColumn, metric]);

  const jsQuery = useMemo(() => (query ? Lib.toJsQuery(query) : null), [query]);

  const { data, isFetching } = useGetAdhocQueryQuery(jsQuery ?? ({} as any), {
    skip: !jsQuery,
  });

  const rawSeries = useMemo(() => {
    if (!data?.data || !jsQuery) {
      return null;
    }
    const cols = data.data.cols as Array<{ source?: string; name?: string }>;
    const dimensionIndex = cols.findIndex((c) => c.source === "breakout");
    const metricIndices = cols
      .map((c, i) => (c.source === "aggregation" ? i : -1))
      .filter((i) => i >= 0);
    const aggregationColumnNames = metricIndices.map((i) => cols[i].name ?? "");

    const rowMetricTotal = (row: (typeof data.data.rows)[number]) =>
      metricIndices.reduce((s, i) => s + (Number(row[i]) || 0), 0);

    let rows = data.data.rows;

    if (metricIndices.length > 1) {
      rows = _.sortBy(rows, (row) => -rowMetricTotal(row));
    }

    if (nullLabel != null && dimensionIndex >= 0) {
      rows = rows.map((row) => {
        if (row[dimensionIndex] == null) {
          const copy = [...row];
          copy[dimensionIndex] = nullLabel;
          return copy;
        }
        return row;
      });
    }

    if (
      maxCategories != null &&
      dimensionIndex >= 0 &&
      metricIndices.length > 0 &&
      rows.length > maxCategories
    ) {
      const keep = rows.slice(0, maxCategories - 1);
      const overflow = rows.slice(maxCategories - 1);
      const otherRow: unknown[] = new Array(cols.length).fill(null);
      otherRow[dimensionIndex] = otherLabel;
      for (const i of metricIndices) {
        otherRow[i] = overflow.reduce(
          (sum, row) => sum + (Number(row[i]) || 0),
          0,
        );
      }
      rows = [...keep, otherRow as (typeof rows)[number]];
    }

    return [
      {
        card: createMockCard({
          dataset_query: jsQuery as any,
          display,
          visualization_settings: {
            "graph.x_axis.title_text": "",
            "graph.y_axis.title_text": "",
            ...(display === "bar" && {
              "graph.x_axis.axis_enabled": "compact",
            }),
            ...getMetricSeriesSettings(metric, aggregationColumnNames),
          },
        }),
        data: { ...data.data, rows },
      },
    ];
  }, [data, jsQuery, display, metric, nullLabel, maxCategories, otherLabel]);

  if (isFetching || !rawSeries) {
    return <Skeleton h={h} />;
  }

  return (
    <Card
      className={cx(S.visualization, {
        [S.nonClickable]: !onDimensionClick,
      })}
      withBorder
      shadow="none"
      px="lg"
      pt="md"
      pb={display === "row" ? "md" : "0"}
      h={h}
    >
      <Text fw="bold" mb="md">
        {title}
      </Text>
      <Visualization
        rawSeries={rawSeries}
        isDashboard
        mode={onDimensionClick ? CLICKABLE_MODE : undefined}
        handleVisualizationClick={(clicked: any) => {
          const value = clicked?.dimensions?.[0]?.value;
          if (value != null && value !== otherLabel && onDimensionClick) {
            onDimensionClick(value);
          }
        }}
      />
    </Card>
  );
}
