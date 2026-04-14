import { useMemo } from "react";

import { useGetAdhocQueryQuery } from "metabase/api";
import type { DateFilterValue } from "metabase/querying/common/types";
import { Card, Skeleton, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type { ClickActionsMode } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import { createMockCard } from "metabase-types/api/mocks";

import { VIEW_CONVERSATIONS } from "../../constants";
import { useAuditTable } from "../../hooks/useAuditTable";

import {
  type UsageStatsMetric,
  applyDateFilter,
  applyUsageStatsAggregation,
  findColumn,
  getChartTitle,
} from "./query-utils";

type Props = {
  dateFilter: DateFilterValue;
  metric: UsageStatsMetric;
  onDimensionClick?: (value: unknown) => void;
};

const CLICKABLE_MODE: ClickActionsMode = {
  actionsForClick: () => [{ name: "custom-click" } as any],
};

export function ConversationsByDayChart({
  dateFilter,
  metric,
  onDimensionClick,
}: Props) {
  const { provider, table } = useAuditTable(VIEW_CONVERSATIONS);

  const query = useMemo(() => {
    if (!provider || !table) {
      return null;
    }
    let q = Lib.queryFromTableOrCardMetadata(provider, table);

    q = applyDateFilter(q, dateFilter);
    const { query: aggregated } = applyUsageStatsAggregation(q, metric);
    q = aggregated;

    const createdAtCol = findColumn(q, "created_at", Lib.breakoutableColumns);
    if (createdAtCol) {
      const buckets = Lib.availableTemporalBuckets(q, 0, createdAtCol);
      const dayBucket = buckets.find((bucket) => {
        const info = Lib.displayInfo(q, 0, bucket);
        return info.shortName === "day";
      });
      const bucketed = dayBucket
        ? Lib.withTemporalBucket(createdAtCol, dayBucket)
        : createdAtCol;
      q = Lib.breakout(q, 0, bucketed);
    }

    return q;
  }, [provider, table, dateFilter, metric]);

  const jsQuery = useMemo(() => (query ? Lib.toJsQuery(query) : null), [query]);

  const { data, isFetching } = useGetAdhocQueryQuery(jsQuery ?? ({} as any), {
    skip: !jsQuery,
  });

  const rawSeries = useMemo(() => {
    if (!data?.data || !jsQuery) {
      return null;
    }
    return [
      {
        card: createMockCard({
          dataset_query: jsQuery as any,
          display: "line",
          visualization_settings: {
            "graph.x_axis.scale": "timeseries",
            "graph.x_axis.title_text": "",
            "graph.y_axis.title_text": "",
          },
        }),
        data: data.data,
      },
    ];
  }, [data, jsQuery]);

  if (isFetching || !rawSeries) {
    return <Skeleton h={350} />;
  }

  return (
    <Card withBorder p="md" h={350}>
      <Text fw="bold" mb="sm">
        {getChartTitle(metric, "day")}
      </Text>
      <Visualization
        rawSeries={rawSeries}
        isDashboard
        mode={onDimensionClick ? CLICKABLE_MODE : undefined}
        handleVisualizationClick={(clicked: any) => {
          const value = clicked?.dimensions?.[0]?.value;
          if (value != null && onDimensionClick) {
            onDimensionClick(value);
          }
        }}
      />
    </Card>
  );
}
