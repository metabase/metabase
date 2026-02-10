import type { CellContext } from "@tanstack/react-table";
import { P, match } from "ts-pattern";
import { c, t } from "ttag";

import { getFormattedTime } from "metabase/common/components/DateTime";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { formatNumber, formatPercent } from "metabase/static-viz/lib/numbers";
import {
  EntityNameCell,
  Flex,
  Text,
  type TreeTableColumnDef,
} from "metabase/ui";
import type { TransformInspectField } from "metabase-types/api";

import type { FieldTreeNode, TableWithFields } from "./types";

export function isKey<T extends object>(x: T, k: PropertyKey): k is keyof T {
  return k in x;
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

export function formatType(field: TransformInspectField): string {
  return field.base_type?.replace("type/", "") ?? t`Unknown`;
}

export function getColumns(): TreeTableColumnDef<FieldTreeNode>[] {
  return [
    {
      id: "column",
      header: t`Field`,
      minWidth: "auto",
      accessorFn: (originalRow) =>
        originalRow.type === "table"
          ? `${originalRow.tableName} (${originalRow.fieldCount})`
          : originalRow.fieldName,
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
    {
      id: "distinct_count",
      header: t`Distincts`,
      width: "auto",
      accessorFn: getDitinctCount,
      cell: renderEllipsified,
    },
    {
      id: "nil_percent",
      header: t`Nil %`,
      accessorFn: getNilPercent,
      width: "auto",
      cell: renderEllipsified,
    },
    {
      id: "range_and_averages",
      header: t`Range and averages`,
      width: "auto",
      accessorFn: (row: FieldTreeNode) => gerRangeAndAverages(row),
      cell: renderEllipsified,
    },
  ];
}

function renderEllipsified(props: CellContext<FieldTreeNode, unknown>) {
  const node = props.row.original;
  if (node.type === "table") {
    return null;
  }
  return <Ellipsified>{String(props.getValue())}</Ellipsified>;
}

function getDitinctCount(node: FieldTreeNode) {
  const distinctCount = node.stats?.distinct_count;
  return distinctCount !== undefined ? distinctCount.toLocaleString() : "";
}

function getNilPercent(node: FieldTreeNode) {
  const nilPercent = node.stats?.nil_percent;
  return nilPercent !== undefined ? formatPercent(nilPercent) : "";
}

function gerRangeAndAverages(node: FieldTreeNode) {
  const { stats, baseType } = node;

  if (!stats) {
    return "";
  }

  const { avg, min, max, earliest, latest } = stats;

  return match(baseType)
    .with(P.string.regex(/DateTime|Date|Time/), () => {
      if (earliest === undefined || latest === undefined) {
        return null;
      }
      const isDateOnly = baseType === "Date";
      const unit = isDateOnly ? "day" : undefined;
      return `${getFormattedTime(earliest, unit)} – ${getFormattedTime(latest, unit)}`;
    })
    .with(P.string.regex(/Integer|Float|Decimal|Number/), () => {
      if (min === undefined || max === undefined) {
        return "";
      }
      const range = `${formatNumber(min)} – ${formatNumber(max)}`;
      if (avg != null) {
        return c("{0} represents range and {1} average)")
          .t`${range} (${formatNumber(avg)} avg)`;
      }
      return range;
    })
    .with(P.string.regex(/Text|String/), () => {
      if (avg === undefined) {
        return "";
      }
      const avgRounded = Math.round(avg);
      return `${avgRounded} character avg.`;
    })
    .otherwise(() => "");
}
