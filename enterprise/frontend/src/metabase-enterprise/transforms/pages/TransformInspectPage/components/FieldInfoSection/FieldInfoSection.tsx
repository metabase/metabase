import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { getFormattedTime } from "metabase/common/components/DateTime";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { formatNumber, formatPercent } from "metabase/static-viz/lib/numbers";
import {
  Card,
  EntityNameCell,
  Flex,
  SimpleGrid,
  Stack,
  Text,
  Title,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import type {
  TransformInspectField,
  TransformInspectFieldStats,
  TransformInspectSource,
  TransformInspectTarget,
} from "metabase-types/api";

type FieldInfoSectionProps = {
  sources: TransformInspectSource[];
  target?: TransformInspectTarget;
};

type FieldTreeNode = {
  id: string;
  type: "table" | "field";
  tableName: string;
  fieldName?: string;
  fieldCount?: number;
  baseType?: string;
  stats?: TransformInspectFieldStats;
  children?: FieldTreeNode[];
};

type TableWithFields = {
  table_id?: number | null;
  table_name: string;
  fields: TransformInspectField[];
};

export const FieldInfoSection = ({
  sources,
  target,
}: FieldInfoSectionProps) => {
  const sourceData = useMemo(() => buildTableNodes(sources), [sources]);
  const targetData = useMemo(
    () => (target ? buildTableNodes([target]) : []),
    [target],
  );

  const columns: TreeTableColumnDef<FieldTreeNode>[] = useMemo(
    () => getColumns(sources),
    [sources],
  );

  const handleRowClick = useCallback((row: Row<FieldTreeNode>) => {
    if (row.getCanExpand()) {
      row.toggleExpanded();
    }
  }, []);

  const sourceInstance = useTreeTableInstance({
    data: sourceData,
    columns,
    getNodeId: (node) => node.id,
    getSubRows: (node) => node.children,
    defaultExpanded: true,
  });

  const targetInstance = useTreeTableInstance({
    data: targetData,
    columns,
    getNodeId: (node) => node.id,
    getSubRows: (node) => node.children,
    defaultExpanded: true,
  });

  return (
    <SimpleGrid cols={2} spacing="lg">
      <Stack gap="md">
        <Title order={4}>{t`Input fields`}</Title>
        <Card p={0} shadow="none" withBorder>
          <TreeTable instance={sourceInstance} onRowClick={handleRowClick} />
        </Card>
      </Stack>

      <Stack gap="md">
        <Title order={4}>{t`Output fields`}</Title>
        {target ? (
          <Card p={0} shadow="none" withBorder>
            <TreeTable instance={targetInstance} onRowClick={handleRowClick} />
          </Card>
        ) : (
          <Text c="text-tertiary">{t`No output table`}</Text>
        )}
      </Stack>
    </SimpleGrid>
  );
};

type StatsColumn =
  | "distinct_count"
  | "nil_percent"
  | "avg"
  | "min_max"
  | "q1_q3"
  | "earliest_latest";

// type StatsFields = TransformInspectFieldStats

const fieldToColumnMap = new Map([
  ["distinct_count", "distinct_count"],
  ["nil_percent", "nil_percent"],
  ["min", "min_max"],
  ["max", "min_max"],
  ["avg", "avg"],
  ["q1", "q1_q3"],
  ["q3", "q1_q3"],
  ["earliest", "earliest_latest"],
  ["latest", "earliest_latest"],
]);

function fieldToColumn(distinctFields: Set<string>) {
  const columns = new Set<string>();
  for (const field of distinctFields) {
    columns.add(fieldToColumnMap.get(field) ?? field);
  }
  return columns;
}

function gatherColumnStasticsFields(
  sources: TransformInspectSource[],
): Set<StatsColumn> {
  const distinctFields = new Set<string>();
  const distinctColumns = new Set<StatsColumn>();
  sources.forEach((source) => {
    source.fields.forEach((field) => {
      if (!field.stats) {
        return;
      }
      for (const [key] of Object.entries(field.stats)) {
        distinctFields.add(key);
      }
    });
  });

  for (const column of fieldToColumn(distinctFields)) {
    distinctColumns.add(column);
  }

  return distinctColumns;
}

const buildTableNodes = (tables: TableWithFields[]): FieldTreeNode[] => {
  return tables.map((table) => {
    const tableKey = table.table_id ?? table.table_name;
    return {
      id: `table-${tableKey}`,
      type: "table" as const,
      tableName: table.table_name,
      fieldCount: table.fields.length,
      children: table.fields.map((field) => ({
        id: `field-${tableKey}-${field.name}`,
        type: "field" as const,
        tableName: table.table_name,
        fieldName: field.display_name ?? field.name,
        baseType: formatType(field),
        stats: field.stats,
      })),
    };
  });
};

function getColumnLabel(columnName: StatsColumn) {
  const statisticsInfo = {
    distinct_count: t`Distinct count`,
    nil_percent: t`Nil %`,
    avg: t`Average`,
    min_max: t`Min/Max`,
    q1_q3: "Q1/Q3",
    earliest_latest: "Earliest/Latest",
  };

  return statisticsInfo[columnName];
}

function formatType(field: TransformInspectField): string {
  return field.base_type?.replace("type/", "") ?? t`Unknown`;
}

function getColumns(
  sources: TransformInspectSource[],
): TreeTableColumnDef<FieldTreeNode>[] {
  const statColumns = gatherColumnStasticsFields(sources);

  return [
    {
      id: "column",
      header: t`Column`,
      minWidth: "auto",
      maxAutoWidth: 400,
      accessorFn: (originalRow) =>
        originalRow.tableName + originalRow.fieldCount,
      cell: ({ row }) => {
        const node = row.original;
        if (node.type === "table") {
          return (
            <EntityNameCell
              icon="table"
              name={
                <Flex align="center" gap="xs">
                  <Text fw="bold">{node.tableName}</Text>{" "}
                  <Text c="text-secondary">({node.fieldCount})</Text>
                </Flex>
              }
            />
          );
        }
        return <Ellipsified>{node.fieldName}</Ellipsified>;
      },
    },
    {
      id: "type",
      header: t`Type`,
      width: "auto",
      accessorFn: (originalRow) => originalRow.baseType,
      cell: ({ row }) => {
        const node = row.original;
        if (node.type === "field") {
          return <Text ta="right">{node.baseType}</Text>;
        }
        return null;
      },
    },
    ...Array.from(statColumns).map((column) => ({
      id: column,
      header: getColumnLabel(column),
      cell: ({ row }: { row: Row<FieldTreeNode> }) => {
        return <Text>{getStatsColumnValue(row.original, column)}</Text>;
      },
    })),
  ];
}

function getStatsColumnValue(node: FieldTreeNode, column: StatsColumn) {
  const { stats } = node;
  if (!stats) {
    return "";
  }

  const {
    distinct_count,
    avg,
    nil_percent,
    min,
    max,
    q1,
    q3,
    earliest,
    latest,
  } = stats;

  return match(column)
    .with("distinct_count", () => distinct_count)
    .with("avg", () => avg)
    .with("nil_percent", () => nil_percent && formatPercent(nil_percent))
    .with("min_max", () => (min ? `${min} - ${max}` : ""))
    .with("q1_q3", () =>
      q1 && q3 ? `${formatNumber(q1)} - ${formatNumber(q3)}` : "",
    )
    .with("earliest_latest", () =>
      earliest && latest
        ? `${getFormattedTime(earliest)} - ${getFormattedTime(latest)}`
        : "",
    )
    .exhaustive();
}
