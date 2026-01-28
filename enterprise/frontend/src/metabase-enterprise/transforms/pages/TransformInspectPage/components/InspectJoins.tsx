import { useMemo } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import {
  Card,
  Code,
  Flex,
  Icon,
  type IconName,
  Stack,
  Text,
  Title,
  Tooltip,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import type {
  TransformInspectJoin,
  TransformInspectSource,
} from "metabase-types/api";

type InspectJoinsProps = {
  joins: TransformInspectJoin[];
  sources: TransformInspectSource[] | undefined;
};

type JoinRow = TransformInspectJoin & {
  id: string;
  tableName: string | undefined;
};

function formatPercent(value: number | undefined): string {
  if (value === undefined) {
    return "-";
  }
  return `${Math.round(value * 100)}%`;
}

export function InspectJoins({ joins, sources }: InspectJoinsProps) {
  const data: JoinRow[] = useMemo(
    () =>
      joins.map((join, index) => ({
        ...join,
        id: `join-${index}`,
        tableName: sources?.find(
          (source) => source.table_id === join.source_table,
        )?.table_name,
      })),
    [joins, sources],
  );

  const columns = useMemo<TreeTableColumnDef<JoinRow>[]>(
    () => [
      {
        id: "join",
        header: t`Join`,
        cell: ({ row }) => (
          <>
            <Tooltip label={getJoinStrategyLabel(row.original.strategy)}>
              <Icon
                name={getJoinStrategyIcon(row.original.strategy)}
                c="brand"
                size={24}
              />
            </Tooltip>{" "}
            <Code bg="transparent">{row.original.tableName}</Code>
          </>
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
        id: "warnings",
        header: t`Warnings`,
        width: 220,
        cell: ({ row }) => getWarningsCell(row.original),
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

function getFilledRowsCell(row: JoinRow): string | null | React.ReactNode {
  const { stats, strategy } = row;
  return match(strategy)
    .with(
      P.union("left-join", "right-join"),
      () => stats?.output_row_count?.toLocaleString() ?? "-",
    )
    .with(P.union("inner-join"), () => (
      <Flex flex="row" gap="xs" align="center">
        {stats?.output_row_count} ({stats?.left_row_count?.toLocaleString()} /
        {stats?.right_row_count?.toLocaleString()})
      </Flex>
    ))
    .with(
      "full-join",
      () =>
        `${stats?.output_row_count} (${stats?.left_row_count} / ${stats?.right_row_count?.toLocaleString()}) ⤴ ${stats?.expansion_factor}`,
    )
    .otherwise(() => null);
}

const JOIN_ICONS: Record<string, IconName> = {
  "left-join": "join_left_outer",
  "right-join": "join_right_outer",
  "inner-join": "join_inner",
  "full-join": "join_full_outer",
};

export function getJoinStrategyIcon(strategyInfo: string) {
  return JOIN_ICONS[strategyInfo];
}

export function getJoinStrategyLabel(strategyInfo: string) {
  const JOIN_LABELS: Record<string, string> = {
    "left-join": t`Left Join`,
    "right-join": t`Right Join`,
    "inner-join": t`Inner Join`,
    "full-join": t`Full Join`,
  };

  return JOIN_LABELS[strategyInfo] || strategyInfo;
}

function getCrossProductWarningCell(
  row: JoinRow,
): React.ReactNode | string | null {
  const { stats, strategy } = row;
  const hasCrossProductWarning = getHasCrossProductWarning(row);

  if (!hasCrossProductWarning) {
    return null;
  }

  const expansionMessage = match(strategy)
    .with("full-join", () => {
      const factor = stats.expansion_factor
        ? `${stats.expansion_factor.toFixed(1)}×`
        : "high";
      return t`${factor} expansion - check for duplicate keys`;
    })
    .with("left-join", () => {
      const leftCount = stats.left_row_count ?? 0;
      const outputCount = stats.output_row_count ?? 0;
      const factor =
        leftCount > 0 ? (outputCount / leftCount).toFixed(1) : "high";
      return t`${factor}× more rows than input - check for duplicate join keys`;
    })
    .with("right-join", () => {
      const rightCount = stats.right_row_count ?? 0;
      const outputCount = stats.output_row_count ?? 0;
      const factor =
        rightCount > 0 ? (outputCount / rightCount).toFixed(1) : "high";
      return t`${factor}× more rows than input - check for duplicate join keys`;
    })
    .with("inner-join", () => {
      const maxInput = Math.max(
        stats.left_row_count ?? 0,
        stats.right_row_count ?? 0,
      );
      const outputCount = stats.output_row_count ?? 0;
      const factor =
        maxInput > 0 ? (outputCount / maxInput).toFixed(1) : "high";
      return t`${factor}× more rows than largest input - possible cartesian product`;
    })
    .otherwise(() => null);

  if (!expansionMessage) {
    return null;
  }

  return (
    <Tooltip label={expansionMessage} multiline maw={300}>
      <Flex gap="xs" align="center" justify="flex-end">
        <Icon name="warning" c="warning" size={16} />
        <Text size="sm" c="warning">
          {t`Cross product`}
        </Text>
      </Flex>
    </Tooltip>
  );
}

const CROSS_PRODUCT_THRESHOLD = 2;
const NULL_KEY_WARNING_THRESHOLD = 0.05;

function getHasCrossProductWarning(row: JoinRow) {
  const { stats, strategy } = row;

  if (!stats) {
    return false;
  }

  const {
    output_row_count,
    left_row_count,
    right_row_count,
    expansion_factor,
  } = stats;

  return match(strategy)
    .with("left-join", () => {
      if (!output_row_count || !left_row_count) {
        return false;
      }
      return (
        output_row_count > left_row_count &&
        output_row_count / left_row_count > CROSS_PRODUCT_THRESHOLD
      );
    })
    .with("right-join", () => {
      if (!output_row_count || !right_row_count) {
        return false;
      }
      return output_row_count / right_row_count > CROSS_PRODUCT_THRESHOLD;
    })
    .with("inner-join", () => {
      if (!output_row_count || !left_row_count || !right_row_count) {
        return false;
      }
      const max = Math.max(left_row_count, right_row_count);
      return output_row_count / max > CROSS_PRODUCT_THRESHOLD;
    })
    .with("full-join", () => {
      if (!expansion_factor) {
        return false;
      }
      return expansion_factor > CROSS_PRODUCT_THRESHOLD;
    })
    .otherwise(() => false);
}

function getNullKeyWarningCell(row: JoinRow): React.ReactNode | null {
  const { stats, strategy } = row;

  const nullCount = stats?.rhs_null_key_count;
  const nullPercent = stats?.rhs_null_key_percent;

  if (
    nullCount === undefined ||
    nullPercent === undefined ||
    nullCount === 0 ||
    nullPercent < NULL_KEY_WARNING_THRESHOLD
  ) {
    return null;
  }

  const warningMessage = match(strategy)
    .with(
      "inner-join",
      () =>
        t`${nullCount.toLocaleString()} rows (${formatPercent(nullPercent)}) have NULL join keys and won't match in this inner join`,
    )
    .with(
      P.union("left-join", "right-join", "full-join"),
      () =>
        t`${nullCount.toLocaleString()} rows (${formatPercent(nullPercent)}) have NULL join keys`,
    )
    .otherwise(() => null);

  if (!warningMessage) {
    return null;
  }

  return (
    <Tooltip label={warningMessage} multiline maw={300}>
      <Flex gap="xs" align="center" justify="flex-end">
        <Icon name="warning" c="warning" size={16} />
        <Text size="sm" c="warning">
          {t`NULL join keys`}
        </Text>
      </Flex>
    </Tooltip>
  );
}

function getWarningsCell(row: JoinRow): React.ReactNode {
  const crossProductWarning = getCrossProductWarningCell(row);
  const nullKeyWarning = getNullKeyWarningCell(row);

  if (!crossProductWarning && !nullKeyWarning) {
    return null;
  }

  return (
    <Stack gap="xs" align="flex-end">
      {crossProductWarning}
      {nullKeyWarning}
    </Stack>
  );
}
