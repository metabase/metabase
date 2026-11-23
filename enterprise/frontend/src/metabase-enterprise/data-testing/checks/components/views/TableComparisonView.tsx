import { t } from "ttag";

import { Box, Card, Group, SimpleGrid, Stack, Text } from "metabase/ui";

import type {
  DataCheckDefinition,
  DataCheckResult,
  DataCheckRow,
} from "../../types";
import {
  formatDataCheckNumber,
  formatDataCheckValue,
  getDataCheckDisplayStatus,
  getDataCheckStatusPresentation,
  isDataCheckRecord,
} from "../../utils";

import { FailingRowsView } from "./FailingRowsView";
import { GenericResultView } from "./GenericResultView";
import type { DataCheckViewProps } from "./types";

const MISMATCH_COLUMNS = ["value", "other_value"] as const;

export function TableComparisonView(props: DataCheckViewProps) {
  const { definition, result } = props;
  const sides = getComparisonSides(definition, result);
  const rows = result["failing-rows"] ?? [];
  const hasRows = rows.length > 0;
  const oneSided = getOneSidedValues(definition, rows);
  if (sides == null && !hasRows) {
    return <GenericResultView {...props} />;
  }
  const { color } = getDataCheckStatusPresentation(
    getDataCheckDisplayStatus(result),
  );

  return (
    <Stack gap="md">
      {sides != null && (
        <SimpleGrid cols={3} spacing="md">
          <ComparisonSide {...sides.table} />
          <Stack gap="xs" align="center" justify="center">
            <Text c="text-secondary" fz="sm">{t`Difference`}</Text>
            <Text fz="xl" fw="bold" c={color}>
              {formatSignedNumber(sides.table.value - sides.other.value)}
            </Text>
            <Text c="text-secondary" fz="sm">
              {getExpectationLabel(definition)}
            </Text>
          </Stack>
          <ComparisonSide {...sides.other} />
        </SimpleGrid>
      )}
      {oneSided != null ? (
        <OneSidedValues groups={oneSided} />
      ) : (
        <FailingRowsView
          {...props}
          columnLabels={getComparisonColumnLabels(definition)}
          extraHighlightedColumns={MISMATCH_COLUMNS}
        />
      )}
    </Stack>
  );
}

type OneSidedGroup = {
  label: string;
  values: string[];
};

function OneSidedValues({ groups }: { groups: OneSidedGroup[] }) {
  return (
    <Stack gap="sm">
      {groups.map(({ label, values }) => (
        <Stack key={label} gap="xs">
          <Text c="text-secondary">{label}</Text>
          <Group gap="sm">
            {values.map((value) => (
              <Box
                key={value}
                px="sm"
                py={2}
                bdrs="sm"
                ff="monospace"
                fz="sm"
                bd="1px dashed var(--mb-color-feedback-negative)"
              >
                {value}
              </Box>
            ))}
          </Group>
        </Stack>
      ))}
    </Stack>
  );
}

function getOneSidedValues(
  definition: DataCheckDefinition,
  rows: readonly DataCheckRow[],
): OneSidedGroup[] | null {
  const isOneSided =
    rows.length > 0 &&
    rows.every(
      (row) => typeof row.side === "string" && Object.keys(row).length === 2,
    );
  if (!isOneSided) {
    return null;
  }
  const other = getStringParam(definition, "other") ?? t`the other table`;
  const { table } = definition;
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const label =
      row.side === "only_in_other"
        ? t`In ${other} but not in ${table}`
        : t`In ${table} but not in ${other}`;
    groups.set(label, [
      ...(groups.get(label) ?? []),
      formatDataCheckValue(row.value),
    ]);
  }
  return [...groups].map(([label, values]) => ({ label, values }));
}

type ComparisonSideProps = {
  table: string;
  measure: string;
  value: number;
  filter?: string;
};

function ComparisonSide({
  table,
  measure,
  value,
  filter,
}: ComparisonSideProps) {
  return (
    <Card withBorder shadow="none" p="md">
      <Stack gap="xs">
        <Text fw="bold">{table}</Text>
        <Text c="text-secondary" fz="sm">
          {measure}
        </Text>
        <Text fz="xl" fw="bold">
          {formatDataCheckNumber(value)}
        </Text>
        {filter != null && (
          <Text c="text-secondary" fz="sm">
            {t`where ${filter}`}
          </Text>
        )}
      </Stack>
    </Card>
  );
}

function formatSignedNumber(value: number) {
  const formatted = formatDataCheckNumber(Math.abs(value));
  if (value === 0) {
    return formatted;
  }
  return value > 0 ? `+${formatted}` : `−${formatted}`;
}

function getStringParam(definition: DataCheckDefinition, name: string) {
  const value = definition.params[name];
  return typeof value === "string" ? value : undefined;
}

function getComparisonSides(
  definition: DataCheckDefinition,
  result: DataCheckResult,
): { table: ComparisonSideProps; other: ComparisonSideProps } | null {
  const { metric } = result;
  if (!isDataCheckRecord(metric)) {
    return null;
  }
  const { table, other } = metric;
  if (typeof table !== "number" || typeof other !== "number") {
    return null;
  }
  const column = getStringParam(definition, "column");
  const otherColumn = getStringParam(definition, "other_column");
  return {
    table: {
      table: definition.table,
      measure:
        getStringParam(definition, "agg") ??
        (column != null ? t`distinct ${column}` : t`rows`),
      value: table,
      filter: definition.where,
    },
    other: {
      table: getStringParam(definition, "other") ?? t`Other table`,
      measure:
        getStringParam(definition, "other_agg") ??
        (otherColumn != null ? t`distinct ${otherColumn}` : t`rows`),
      value: other,
      filter: getStringParam(definition, "other_where"),
    },
  };
}

function getExpectationLabel(definition: DataCheckDefinition) {
  const { tolerance_abs: absolute, tolerance_pct: percent } = definition.params;
  if (definition.check === "row_count_fewer_than_other") {
    return t`Expected fewer rows than the other table`;
  }
  if (typeof percent === "number") {
    return t`Allowed: ±${percent}%`;
  }
  if (typeof absolute === "number" && absolute !== 0) {
    return t`Allowed: ±${formatDataCheckNumber(absolute)}`;
  }
  return t`Expected to be equal`;
}

function getComparisonColumnLabels(
  definition: DataCheckDefinition,
): Record<string, string> {
  const other = getStringParam(definition, "other");
  const column = getStringParam(definition, "column");
  const key = getStringParam(definition, "key");
  const otherColumn = getStringParam(definition, "other_column");
  const otherKey = getStringParam(definition, "other_key");
  if (other == null || key == null || otherKey == null) {
    return {};
  }
  return {
    key: `${definition.table}.${key}`,
    other_key: `${other}.${otherKey}`,
    value: `${definition.table}.${column}`,
    other_value: `${other}.${otherColumn}`,
  };
}
