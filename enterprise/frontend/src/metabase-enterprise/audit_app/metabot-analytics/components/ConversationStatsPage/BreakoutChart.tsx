import { useMemo } from "react";

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

import {
  type UsageStatsMetric,
  applyDateFilter,
  applyUsageStatsAggregation,
  findColumn,
} from "./query-utils";

type Props = {
  dateFilter: DateFilterValue;
  breakoutColumn: string;
  title: string;
  display?: VisualizationDisplay;
  metric: UsageStatsMetric;
  onDimensionClick?: (value: unknown) => void;
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
  onDimensionClick,
}: Props) {
  const { provider, table } = useAuditTable(VIEW_CONVERSATIONS);

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

    const orderCol = findColumn(q, orderColumnName, Lib.orderableColumns);
    if (orderCol) {
      q = Lib.orderBy(q, 0, orderCol, "desc");
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
    return [
      {
        card: createMockCard({
          dataset_query: jsQuery as any,
          display,
          visualization_settings: {
            "graph.x_axis.title_text": "",
            "graph.y_axis.title_text": "",
          },
        }),
        data: data.data,
      },
    ];
  }, [data, jsQuery, display]);

  if (isFetching || !rawSeries) {
    return <Skeleton h={350} />;
  }

  return (
    <Card withBorder shadow="none" p="md" h={350}>
      <Text fw="bold" mb="sm">
        {title}
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
