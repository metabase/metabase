import { useMemo } from "react";

import { useGetAdhocQueryQuery } from "metabase/api";
import type { DateFilterValue } from "metabase/querying/common/types";
import { Card, Skeleton, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import type { VisualizationDisplay } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import { VIEW_CONVERSATIONS } from "../../constants";
import { useAuditTable } from "../../hooks/useAuditTable";

import { applyDateFilter, findColumn } from "./query-utils";

type Props = {
  dateFilter: DateFilterValue;
  breakoutColumn: string;
  title: string;
  display?: VisualizationDisplay;
};

export function BreakoutChart({
  dateFilter,
  breakoutColumn,
  title,
  display = "row",
}: Props) {
  const { provider, table } = useAuditTable(VIEW_CONVERSATIONS);

  const query = useMemo(() => {
    if (!provider || !table) {
      return null;
    }
    let q = Lib.queryFromTableOrCardMetadata(provider, table);

    q = applyDateFilter(q, dateFilter);
    q = Lib.aggregateByCount(q, 0);

    const col = findColumn(q, breakoutColumn, Lib.breakoutableColumns);
    if (col) {
      q = Lib.breakout(q, 0, col);
    }

    const countCol = findColumn(q, "count", Lib.orderableColumns);
    if (countCol) {
      q = Lib.orderBy(q, 0, countCol, "desc");
    }

    return q;
  }, [provider, table, dateFilter, breakoutColumn]);

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
    return <Skeleton h={300} />;
  }

  return (
    <Card withBorder p="md" h={350}>
      <Text fw="bold" mb="sm">
        {title}
      </Text>
      <Visualization rawSeries={rawSeries} isDashboard />
    </Card>
  );
}
