import type { CellContext } from "@tanstack/react-table";
import { match } from "ts-pattern";
import { t } from "ttag";

import { getFormattedTime } from "metabase/common/components/DateTime";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { formatNumber, formatPercent } from "metabase/static-viz/lib/numbers";
import {
  EntityNameCell,
  Flex,
  Text,
  type TreeTableColumnDef,
} from "metabase/ui";
import type {
  FieldStats,
  TransformInspectField,
  TransformInspectSource,
} from "metabase-types/api";

import type {
  FieldTreeNode,
  StatsColumn,
  TableWithFields,
} from "./FieldInfoSection.types";

const fieldToColumnMap = new Map<FieldStats, StatsColumn>([
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

export function fieldToColumn(distinctFields: Set<FieldStats>): Set<string> {
  const columns = new Set<string>();
  for (const field of distinctFields) {
    columns.add(fieldToColumnMap.get(field) ?? field);
  }
  return columns;
}

export function isKey<T extends object>(x: T, k: PropertyKey): k is keyof T {
  return k in x;
}

// construct a set of column IDs based on the distinct field stats available
export function gatherColumnStasticsFields(
  sources: TransformInspectSource[],
): Set<string> {
  const distinctFields = new Set<FieldStats>();
  const distinctColumns = new Set<StatsColumn | string>();
  sources.forEach((source) => {
    source.fields.forEach((field) => {
      if (!field.stats) {
        return;
      }
      for (const key of Object.keys(field.stats)) {
        if (isKey(field.stats, key)) {
          distinctFields.add(key);
        }
      }
    });
  });

  for (const column of fieldToColumn(distinctFields)) {
    distinctColumns.add(column);
  }

  return distinctColumns;
}

export function buildTableNodes(tables: TableWithFields[]): FieldTreeNode[] {
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
}

export function getColumnLabel(columnName: StatsColumn | string) {
  const statisticsInfo = {
    distinct_count: t`Distinct count`,
    nil_percent: t`Nil %`,
    avg: t`Average`,
    min_max: t`Min/Max`,
    q1_q3: "Q1/Q3",
    earliest_latest: "Earliest/Latest",
  };

  if (isKey(statisticsInfo, columnName)) {
    return statisticsInfo[columnName];
  }

  return columnName;
}

export function formatType(field: TransformInspectField): string {
  return field.base_type?.replace("type/", "") ?? t`Unknown`;
}

export function getColumns(
  sources: TransformInspectSource[],
): TreeTableColumnDef<FieldTreeNode>[] {
  const statColumns = gatherColumnStasticsFields(sources);

  return [
    {
      id: "column",
      header: t`Column`,
      minWidth: "auto",
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
      cell: (props) => {
        const node = props.row.original;
        if (node.type === "field") {
          return <Text ta="right">{String(props.getValue())}</Text>;
        }
        return null;
      },
    },
    ...Array.from(statColumns).map((column) => ({
      id: column,
      header: getColumnLabel(column),
      accessorFn: (row: FieldTreeNode) => getStatsColumnValue(row, column),
      cell: (props: CellContext<FieldTreeNode, unknown>) => (
        <Ellipsified>{String(props.getValue())}</Ellipsified>
      ),
    })),
  ];
}

function getStatsColumnValue(node: FieldTreeNode, column: string) {
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
    .with("min_max", () => (min ? `${min} / ${max}` : ""))
    .with("q1_q3", () =>
      q1 && q3 ? `${formatNumber(q1)} / ${formatNumber(q3)}` : "",
    )
    .with("earliest_latest", () =>
      earliest && latest
        ? `${getFormattedTime(earliest)} / ${getFormattedTime(latest)}`
        : "",
    )
    .otherwise(() =>
      column in stats ? String(stats[column as FieldStats]) : "",
    );
}
