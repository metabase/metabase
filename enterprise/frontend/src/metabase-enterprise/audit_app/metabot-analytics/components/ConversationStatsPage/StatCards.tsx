import { useMemo } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import { formatNumber } from "metabase/lib/formatting/numbers";
import type { DateFilterValue } from "metabase/querying/common/types";
import { Card, SimpleGrid, Skeleton, Stack, Text } from "metabase/ui";
import type { CardMetadata, TableMetadata } from "metabase-lib";
import * as Lib from "metabase-lib";

import { VIEW_USAGE } from "../../constants";
import { useAuditTable } from "../../hooks/useAuditTable";

import { addSumAggregation, applyDateFilter } from "./query-utils";

type StatCardProps = {
  loading: boolean;
  label: string;
  value: number;
  format?: (v: number) => string;
};

function StatCard({ loading, label, value, format }: StatCardProps) {
  if (loading) {
    return <Skeleton h={100} />;
  }

  const formatted = format
    ? format(value)
    : formatNumber(value, { compact: true });

  return (
    <Card withBorder p="lg">
      <Stack gap="sm">
        <Text c="text-secondary">{label}</Text>
        <Text fw="bold" size="1.75rem">
          {formatted}
        </Text>
      </Stack>
    </Card>
  );
}

function useSumQuery(
  provider: Lib.MetadataProvider | null,
  table: TableMetadata | CardMetadata | null,
  dateFilter: DateFilterValue,
) {
  return useMemo(() => {
    if (!provider || !table) {
      return null;
    }
    let q = Lib.queryFromTableOrCardMetadata(provider, table);

    q = applyDateFilter(q, dateFilter, "usage_date");

    // Order matters — extractRow destructures positionally
    q = addSumAggregation(q, "conversation_count");
    q = addSumAggregation(q, "user_messages");
    q = addSumAggregation(q, "assistant_messages");
    q = addSumAggregation(q, "total_tokens");
    q = addSumAggregation(q, "estimated_cost");

    return q;
  }, [provider, table, dateFilter]);
}

function extractRow(data: any): number[] {
  const row = data?.data?.rows?.[0];
  if (!row) {
    return [0, 0, 0, 0, 0];
  }
  return row.map((v: any) => Number(v) || 0);
}

export function StatCards({ dateFilter }: { dateFilter: DateFilterValue }) {
  const { provider, table } = useAuditTable(VIEW_USAGE);

  const query = useSumQuery(provider, table, dateFilter);

  const { data, isFetching } = useGetAdhocQueryQuery(
    query ? Lib.toJsQuery(query) : ({} as any),
    { skip: !query },
  );

  const stats = useMemo(() => {
    const [conversations, userMsg, asstMsg, tokens, cost] = extractRow(data);

    return {
      conversations,
      messages: userMsg + asstMsg,
      tokens,
      cost,
    };
  }, [data]);

  return (
    <SimpleGrid cols={4}>
      <StatCard
        loading={isFetching}
        label={t`Conversations`}
        value={stats.conversations}
      />
      <StatCard
        loading={isFetching}
        label={t`Messages`}
        value={stats.messages}
      />
      <StatCard loading={isFetching} label={t`Tokens`} value={stats.tokens} />
      <StatCard
        loading={isFetching}
        label={t`Cost`}
        value={stats.cost}
        format={(v) => `$${v.toFixed(2)}`}
      />
    </SimpleGrid>
  );
}
