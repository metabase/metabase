import { useMemo } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import { Card, Skeleton, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { createMockCard } from "metabase-types/api/mocks";

import { DATABASE_ID } from "../../constants";

type Props = {
  days: number;
};

export function ConversationsByUserChart({ days }: Props) {
  const datasetQuery = useMemo(
    () => ({
      type: "native" as const,
      native: {
        query: `
          SELECT
            CONCAT(u.first_name, ' ', u.last_name) AS "User",
            COUNT(*) AS "Count"
          FROM metabot_conversation mc
          JOIN core_user u ON u.id = mc.user_id
          WHERE mc.created_at >= CURRENT_DATE - INTERVAL '${days} days'
          GROUP BY u.first_name, u.last_name
          ORDER BY "Count" DESC
        `,
      },
      database: DATABASE_ID,
    }),
    [days],
  );

  const { data, isFetching } = useGetAdhocQueryQuery(datasetQuery);

  const rawSeries = useMemo(() => {
    if (!data?.data) {
      return null;
    }
    return [
      {
        card: createMockCard({
          dataset_query: datasetQuery as any,
          display: "row",
          visualization_settings: {
            "graph.x_axis.title_text": "",
            "graph.y_axis.title_text": "",
          },
        }),
        data: data.data,
      },
    ];
  }, [data, datasetQuery]);

  if (isFetching || !rawSeries) {
    return <Skeleton h={300} />;
  }

  return (
    <Card withBorder p="md" h={350}>
      <Text fw="bold" mb="sm">{t`Conversations by user`}</Text>
      <Visualization rawSeries={rawSeries} isDashboard />
    </Card>
  );
}
