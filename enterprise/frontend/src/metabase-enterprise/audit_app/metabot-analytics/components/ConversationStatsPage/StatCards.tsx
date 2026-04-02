import { useMemo } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import {
  formatChangeWithSign,
  formatNumber,
} from "metabase/lib/formatting/numbers";
import { Card, SimpleGrid, Skeleton, Stack, Text } from "metabase/ui";

import { DATABASE_ID } from "../../constants";

type StatCardProps = {
  loading: boolean;
  label: string;
  current: number;
  previous: number;
  format?: (v: number) => string;
  days: number;
};

function StatCard({
  loading,
  label,
  current,
  previous,
  format,
  days,
}: StatCardProps) {
  if (loading) {
    return <Skeleton h={100} />;
  }

  const formatted = format
    ? format(current)
    : formatNumber(current, { compact: true });
  const change =
    previous !== 0 ? formatChangeWithSign((current - previous) / previous) : "";

  return (
    <Card withBorder p="lg">
      <Stack gap="sm">
        <Text c="text-secondary">{label}</Text>
        <Text fw="bold" size="1.75rem">
          {formatted}
        </Text>
        {change && (
          <Text size="sm" c={current >= previous ? "success" : "error"} mt={4}>
            {change} {t`vs prior ${days}d`}
          </Text>
        )}
      </Stack>
    </Card>
  );
}

export function StatCards({ days }: { days: number }) {
  const datasetQuery = useMemo(
    () => ({
      type: "native" as const,
      native: {
        query: `
          SELECT
            SUM(CASE WHEN c.created_at >= CURRENT_DATE - INTERVAL '${days} days' THEN 1 ELSE 0 END) AS curr_conversations,
            SUM(CASE WHEN c.created_at < CURRENT_DATE - INTERVAL '${days} days' THEN 1 ELSE 0 END) AS prev_conversations,
            (SELECT COALESCE(SUM(m.total_tokens), 0)
             FROM metabot_message m JOIN metabot_conversation mc ON mc.id = m.conversation_id
             WHERE m.deleted_at IS NULL AND mc.created_at >= CURRENT_DATE - INTERVAL '${days} days') AS curr_tokens,
            (SELECT COALESCE(SUM(m.total_tokens), 0)
             FROM metabot_message m JOIN metabot_conversation mc ON mc.id = m.conversation_id
             WHERE m.deleted_at IS NULL
               AND mc.created_at >= CURRENT_DATE - INTERVAL '${days * 2} days'
               AND mc.created_at < CURRENT_DATE - INTERVAL '${days} days') AS prev_tokens,
            (SELECT COUNT(*)
             FROM metabot_message m JOIN metabot_conversation mc ON mc.id = m.conversation_id
             WHERE m.deleted_at IS NULL AND mc.created_at >= CURRENT_DATE - INTERVAL '${days} days') AS curr_messages,
            (SELECT COUNT(*)
             FROM metabot_message m JOIN metabot_conversation mc ON mc.id = m.conversation_id
             WHERE m.deleted_at IS NULL
               AND mc.created_at >= CURRENT_DATE - INTERVAL '${days * 2} days'
               AND mc.created_at < CURRENT_DATE - INTERVAL '${days} days') AS prev_messages
          FROM metabot_conversation c
          WHERE c.created_at >= CURRENT_DATE - INTERVAL '${days * 2} days'
        `,
      },
      database: DATABASE_ID,
    }),
    [days],
  );

  const { data, isFetching } = useGetAdhocQueryQuery(datasetQuery);

  const stats = useMemo(() => {
    const row = data?.data?.rows?.[0] ?? [0, 0, 0, 0, 0, 0];
    return {
      currConversations: Number(row[0]) || 0,
      prevConversations: Number(row[1]) || 0,
      currTokens: Number(row[2]) || 0,
      prevTokens: Number(row[3]) || 0,
      currMessages: Number(row[4]) || 0,
      prevMessages: Number(row[5]) || 0,
    };
  }, [data]);

  return (
    <SimpleGrid cols={4}>
      <StatCard
        loading={isFetching}
        label={t`Conversations`}
        current={stats.currConversations}
        previous={stats.prevConversations}
        days={days}
      />
      <StatCard
        loading={isFetching}
        label={t`Messages`}
        current={stats.currMessages}
        previous={stats.prevMessages}
        days={days}
      />
      <StatCard
        loading={isFetching}
        label={t`Tokens`}
        current={stats.currTokens}
        previous={stats.prevTokens}
        days={days}
      />
      <StatCard
        loading={isFetching}
        label={t`Cost`}
        current={stats.currTokens * 0.0001}
        previous={stats.prevTokens * 0.0001}
        format={(v) => `$${v.toFixed(2)}`}
        days={days}
      />
    </SimpleGrid>
  );
}
