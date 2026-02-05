import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { getFormattedTime } from "metabase/common/components/DateTime";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { formatPercent } from "metabase/static-viz/lib/numbers";
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
  TransformInspectSource,
  TransformInspectTarget,
} from "metabase-types/api";
import { NUMERIC_BASE_TYPES, TEMPORAL_BASE_TYPES } from "metabase-types/api";

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
  stats?: string | null;
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
    () => getColumns(),
    [],
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
        stats: getFieldStats(field),
      })),
    };
  });
};

function isTemporalField(field: TransformInspectField): boolean {
  return TEMPORAL_BASE_TYPES.some((type) => type === field.base_type);
}

function isNumericField(field: TransformInspectField): boolean {
  return NUMERIC_BASE_TYPES.some((type) => type === field.base_type);
}

function isDate(field: TransformInspectField): boolean {
  return field.base_type === "type/Date";
}

function formatType(field: TransformInspectField): string {
  return field.base_type?.replace("type/", "") ?? t`Unknown`;
}

function formatNumber(value: number | undefined | null): string {
  if (value == null) {
    return "-";
  }

  if (Number.isInteger(value)) {
    return value.toLocaleString();
  }

  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function getFieldStats(field: TransformInspectField): string | null {
  const stats = field.stats;
  if (!stats) {
    return null;
  }

  const parts: string[] = [];

  if (stats.distinct_count !== undefined) {
    parts.push(`${formatNumber(stats.distinct_count)} distinct`);
  }
  if (stats.nil_percent !== undefined && stats.nil_percent > 0) {
    parts.push(`${formatPercent(stats.nil_percent)} null`);
  }

  if (isNumericField(field)) {
    if (stats.min !== undefined && stats.max !== undefined) {
      let range = `${formatNumber(stats.min)}–${formatNumber(stats.max)}`;
      if (stats.avg !== undefined) {
        range += ` (avg ${formatNumber(stats.avg)})`;
      }
      parts.push(range);
    }
  } else if (isTemporalField(field)) {
    if (stats.earliest && stats.latest) {
      const unit = isDate(field) ? "day" : "hour-of-day";
      const earliest = getFormattedTime(stats.earliest, unit);
      const latest = getFormattedTime(stats.latest, unit);
      parts.push(`${earliest} → ${latest}`);
    }
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

function getColumns(): TreeTableColumnDef<FieldTreeNode>[] {
  return [
    {
      id: "column",
      header: t`Column`,
      minWidth: "auto",
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
      cell: ({ row }) => {
        const node = row.original;
        if (node.type === "field") {
          return <Text ta="right">{node.baseType}</Text>;
        }
        return null;
      },
    },
    {
      id: "stats",
      header: t`Stats`,
      cell: ({ row }) => {
        const node = row.original;
        if (node.type === "field" && node.stats) {
          return (
            <Text size="xs" c="text-tertiary">
              {node.stats}
            </Text>
          );
        }
        return null;
      },
    },
  ];
}
