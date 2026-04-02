import { useMemo } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import { Card, SimpleGrid, Skeleton, Text, Title } from "metabase/ui";

import { DATABASE_ID } from "../../constants";

function formatNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return value.toLocaleString();
  }
  return String(value);
}

function formatChange(current: number, previous: number): string | null {
  if (previous === 0) {
    return null;
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct}%`;
}

type StatCardProps = {
  label: string;
  current: number;
  previous: number;
  format?: (v: number) => string;
  days: number;
};

function StatCard({ label, current, previous, format, days }: StatCardProps) {
  const formatted = format ? format(current) : formatNumber(current);
  const change = formatChange(current, previous);

  return (
    <Card withBorder p="md">
      <Text size="sm" c="text-secondary">
        {label}
      </Text>
      <Title order={2} mt="xs">
        {formatted}
      </Title>
      {change != null && (
        <Text size="xs" c={change.startsWith("+") ? "success" : "error"} mt={4}>
          {change} {t`vs prior ${days}d`}
        </Text>
      )}
    </Card>
  );
}

type StatCardsProps = {
  days: number;
};

export function StatCards({ days }: StatCardsProps) {
  const datasetQuery = useMemo(
    () => ({
      type: "native" as const,
      native: {
        query: `
          SELECT
            SUM(CASE WHEN c.created_at >= CURRENT_DATE - INTERVAL '${days} days' THEN 1 ELSE 0 END) AS curr_conversations,
            SUM(CASE WHEN c.created_at < CURRENT_DATE - INTERVAL '${days} days' THEN 1 ELSE 0 END) AS prev_conversations,
            (SELECT COALESCE(SUM(CASE WHEN m.created_at >= CURRENT_DATE - INTERVAL '${days} days' THEN m.total_tokens ELSE 0 END), 0)
             FROM metabot_message m WHERE m.deleted_at IS NULL AND m.created_at >= CURRENT_DATE - INTERVAL '${days * 2} days') AS curr_tokens,
            (SELECT COALESCE(SUM(CASE WHEN m.created_at < CURRENT_DATE - INTERVAL '${days} days' THEN m.total_tokens ELSE 0 END), 0)
             FROM metabot_message m WHERE m.deleted_at IS NULL AND m.created_at >= CURRENT_DATE - INTERVAL '${days * 2} days') AS prev_tokens,
            (SELECT COUNT(CASE WHEN m.created_at >= CURRENT_DATE - INTERVAL '${days} days' THEN 1 END)
             FROM metabot_message m WHERE m.deleted_at IS NULL AND m.created_at >= CURRENT_DATE - INTERVAL '${days * 2} days') AS curr_messages,
            (SELECT COUNT(CASE WHEN m.created_at < CURRENT_DATE - INTERVAL '${days} days' THEN 1 END)
             FROM metabot_message m WHERE m.deleted_at IS NULL AND m.created_at >= CURRENT_DATE - INTERVAL '${days * 2} days') AS prev_messages
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
    if (!data?.data?.rows?.[0]) {
      return null;
    }
    const row = data.data.rows[0];
    return {
      currConversations: Number(row[0]) || 0,
      prevConversations: Number(row[1]) || 0,
      currTokens: Number(row[2]) || 0,
      prevTokens: Number(row[3]) || 0,
      currMessages: Number(row[4]) || 0,
      prevMessages: Number(row[5]) || 0,
    };
  }, [data]);

  if (isFetching || !stats) {
    return (
      <SimpleGrid cols={4} mt="md">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} h={100} />
        ))}
      </SimpleGrid>
    );
  }

  const currCost = stats.currTokens * 0.0001;
  const prevCost = stats.prevTokens * 0.0001;

  return (
    <SimpleGrid cols={4} mt="md">
      <StatCard
        label={t`Conversations`}
        current={stats.currConversations}
        previous={stats.prevConversations}
        days={days}
      />
      <StatCard
        label={t`Messages`}
        current={stats.currMessages}
        previous={stats.prevMessages}
        days={days}
      />
      <StatCard
        label={t`Tokens`}
        current={stats.currTokens}
        previous={stats.prevTokens}
        days={days}
      />
      <StatCard
        label={t`Cost`}
        current={currCost}
        previous={prevCost}
        format={(v) => `$${v.toFixed(2)}`}
        days={days}
      />
    </SimpleGrid>
  );
}
