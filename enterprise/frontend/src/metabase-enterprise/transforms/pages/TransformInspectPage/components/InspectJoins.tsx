import { useMemo } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import {
  Card,
  Code,
  Stack,
  Text,
  Title,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import type { TransformInspectJoin } from "metabase-types/api";

type InspectJoinsProps = {
  joins: TransformInspectJoin[];
};

type JoinRow = TransformInspectJoin & { id: string };

function formatJoinDisplay(join: TransformInspectJoin): string {
  const strategy = join.strategy.toUpperCase().replace(/-/g, " ");
  if (join.alias) {
    return `${strategy} ${join.alias}`;
  }
  return strategy;
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) {
    return "-";
  }
  return `${Math.round(value * 100)}%`;
}

export function InspectJoins({ joins }: InspectJoinsProps) {
  const data: JoinRow[] = useMemo(
    () => joins.map((join, index) => ({ ...join, id: `join-${index}` })),
    [joins],
  );

  const columns = useMemo<TreeTableColumnDef<JoinRow>[]>(
    () => [
      {
        id: "join",
        header: t`Join`,
        cell: ({ row }) => (
          <Code bg="transparent">{formatJoinDisplay(row.original)}</Code>
        ),
      },
      {
        id: "filled_rows",
        header: t`Filled rows`,
        width: 120,
        cell: ({ row }) => (
          <Text size="sm" ta="right">
            {getFilledRowsCell(row.original)}
          </Text>
        ),
      },
      {
        id: "percent_with_entry",
        header: t`% with entry`,
        width: 120,
        cell: ({ row }) => (
          <Text size="sm" ta="right">
            {getEntryPercentageCell(row.original)}
          </Text>
        ),
      },
      {
        id: "outer_join_crosses",
        header: t`Outer join crosses`,
        width: 150,
        cell: ({ row }) => (
          <Text size="sm" ta="right">
            {row.original.outer_join_crosses?.toLocaleString() ?? "-"}
          </Text>
        ),
      },
    ],
    [],
  );

  const instance = useTreeTableInstance({
    data,
    columns,
    getNodeId: (node) => node.id,
  });

  return (
    <Stack gap="md">
      <Title order={3}>{t`Joins`}</Title>
      <Card p={0} shadow="none" withBorder>
        <TreeTable instance={instance} />
      </Card>
    </Stack>
  );
}

function getEntryPercentageCell(row: JoinRow): string | null {
  const { strategy, stats } = row;

  return match(strategy)
    .with(P.union("left-join", "right-join"), () =>
      formatPercent(stats?.match_rate),
    )
    .with(
      "inner-join",
      () =>
        `${formatPercent(stats?.left_match_rate)} / ${formatPercent(stats?.right_match_rate)}`,
    )
    .with("full-join", () => "-")
    .otherwise(() => null);
}

function getFilledRowsCell(row: JoinRow): string | null {
  const { stats, strategy } = row;
  return match(strategy)
    .with(
      P.union("left-join", "right-join"),
      () => stats?.matched_count?.toLocaleString() ?? "-",
    )
    .with(
      P.union("inner-join", "full-join"),
      () =>
        `${stats?.left_row_count?.toLocaleString()} / ${stats?.right_row_count?.toLocaleString()}`,
    )
    .otherwise(() => null);
}
