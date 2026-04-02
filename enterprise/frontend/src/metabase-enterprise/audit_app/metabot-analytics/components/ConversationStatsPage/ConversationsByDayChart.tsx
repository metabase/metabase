import { useMemo } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getMetadataUnfiltered } from "metabase/selectors/metadata";
import { Card, Skeleton, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import { createMockCard } from "metabase-types/api/mocks";

import { DATABASE_ID, METABOT_CONVERSATION_TABLE_ID } from "../../constants";

import { addDateFilter, findColumn } from "./query-utils";

type Props = {
  days: number;
};

export function ConversationsByDayChart({ days }: Props) {
  const metadata = useSelector(getMetadataUnfiltered);

  const query = useMemo(() => {
    const provider = Lib.metadataProvider(DATABASE_ID, metadata);
    const table = Lib.tableOrCardMetadata(
      provider,
      METABOT_CONVERSATION_TABLE_ID,
    );
    if (!table) {
      return null;
    }
    let q = Lib.queryFromTableOrCardMetadata(provider, table);

    q = addDateFilter(q, days);
    q = Lib.aggregateByCount(q, 0);

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
  }, [metadata, days]);

  const { data, isFetching } = useGetAdhocQueryQuery(
    query ? Lib.toJsQuery(query) : ({} as any),
    { skip: !query },
  );

  const rawSeries = useMemo(() => {
    if (!data?.data || !query) {
      return null;
    }
    return [
      {
        card: createMockCard({
          dataset_query: Lib.toJsQuery(query) as any,
          display: "bar",
          visualization_settings: {
            "graph.x_axis.scale": "timeseries",
            "graph.x_axis.title_text": "",
            "graph.y_axis.title_text": "",
          },
        }),
        data: data.data,
      },
    ];
  }, [data, query]);

  if (isFetching || !rawSeries) {
    return <Skeleton h={300} />;
  }

  return (
    <Card withBorder p="md" h={350}>
      <Text fw="bold" mb="sm">{t`Conversations by day`}</Text>
      <Visualization rawSeries={rawSeries} isDashboard />
    </Card>
  );
}
