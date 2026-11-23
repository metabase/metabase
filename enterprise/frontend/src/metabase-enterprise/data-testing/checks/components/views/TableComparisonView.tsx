import { t } from "ttag";

import { Card, Code, SimpleGrid, Stack, Text } from "metabase/ui";

import type { DataCheckDefinition, DataCheckResult } from "../../types";
import {
  formatDataCheckNumber,
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
  const hasRows = (result["failing-rows"] ?? []).length > 0;
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
      <FailingRowsView
        {...props}
        columnLabels={getComparisonColumnLabels(definition)}
        extraHighlightedColumns={MISMATCH_COLUMNS}
      />
    </Stack>
  );
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
        {filter != null && <Code>{filter}</Code>}
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
