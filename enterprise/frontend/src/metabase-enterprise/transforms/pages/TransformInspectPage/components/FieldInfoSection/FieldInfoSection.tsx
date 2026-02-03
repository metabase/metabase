import { useMemo } from "react";
import { t } from "ttag";

import { Icon } from "metabase/ui";
import {
  Accordion,
  Card,
  SimpleGrid,
  Stack,
  Text,
  Title,
  type TreeNodeData,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import type {
  TransformInspectField,
  TransformInspectSource,
  TransformInspectTarget,
} from "metabase-types/api";

import S from "./FieldInfoSection.module.css";

type FieldInfoSectionProps = {
  sources: TransformInspectSource[];
  target?: TransformInspectTarget;
};

const TEMPORAL_BASE_TYPES = new Set([
  "type/DateTime",
  "type/DateTimeWithLocalTZ",
  "type/DateTimeWithTZ",
  "type/DateTimeWithZoneID",
  "type/DateTimeWithZoneOffset",
  "type/Date",
  "type/Time",
  "type/TimeWithTZ",
]);

const NUMERIC_BASE_TYPES = new Set([
  "type/Integer",
  "type/BigInteger",
  "type/Float",
  "type/Decimal",
  "type/Number",
]);

function isTemporalField(field: TransformInspectField): boolean {
  return TEMPORAL_BASE_TYPES.has(field.base_type ?? "");
}

function isNumericField(field: TransformInspectField): boolean {
  return NUMERIC_BASE_TYPES.has(field.base_type ?? "");
}

function formatType(field: TransformInspectField): string {
  return field.base_type?.replace("type/", "") ?? "Unknown";
}

function formatNumber(value: number | undefined): string {
  if (value === undefined) {
    return "-";
  }
  if (Number.isInteger(value)) {
    return value.toLocaleString();
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) {
    return "-";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(value: string | undefined): string {
  if (!value) {
    return "-";
  }
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
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
      parts.push(`${formatDate(stats.earliest)} → ${formatDate(stats.latest)}`);
    }
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

type FieldTreeNode = TreeNodeData & {
  id: string;
  name: string;
  type: "table" | "field";
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

const buildTableNode = (table: TableWithFields): FieldTreeNode => {
  const tableKey = table.table_id ?? table.table_name;
  return {
    id: `table-${tableKey}`,
    name: table.table_name,
    type: "table" as const,
    fieldCount: table.fields.length,
    children: table.fields.map((field) => ({
      id: `field-${tableKey}-${field.name}`,
      name: field.display_name ?? field.name,
      type: "field" as const,
      baseType: formatType(field),
      stats: getFieldStats(field),
    })),
  };
};

export const FieldInfoSection = ({
  sources,
  target,
}: FieldInfoSectionProps) => {
  const sourceTreeData = useMemo(() => sources.map(buildTableNode), [sources]);
  const targetTreeData = useMemo(
    () => (target ? [buildTableNode(target)] : []),
    [target],
  );

  const columns: TreeTableColumnDef<FieldTreeNode>[] = useMemo(
    () => [
      {
        id: "name",
        header: t`Field`,
        minWidth: "auto",
        cell: ({ row }) => {
          const node = row.original;
          if (node.type === "table") {
            return (
              <Text size="sm" fw={600}>
                {node.name}
                <Text size="xs" c="text-tertiary" ml="xs">
                  ({node.fieldCount})
                </Text>
              </Text>
            );
          }
          return (
            <Text size="sm" fw={500}>
              {node.name}
            </Text>
          );
        },
      },
      {
        id: "type",
        header: t`Type`,
        width: 100,
        cell: ({ row }) => {
          const node = row.original;
          if (node.type === "field") {
            return (
              <Text size="xs" c="text-tertiary" ta="right">
                {node.baseType}
              </Text>
            );
          }
          return null;
        },
      },
      {
        id: "stats",
        header: t`Stats`,
        width: 220,
        cell: ({ row }) => {
          const node = row.original;
          if (node.type === "field" && node.stats) {
            return (
              <Text size="xs" c="text-tertiary" ta="right">
                {node.stats}
              </Text>
            );
          }
          return null;
        },
      },
    ],
    [],
  );

  const sourceInstance = useTreeTableInstance({
    data: sourceTreeData,
    columns,
    getNodeId: (node) => node.id,
    getSubRows: (node) => node.children,
  });

  const targetInstance = useTreeTableInstance({
    data: targetTreeData,
    columns,
    getNodeId: (node) => node.id,
    getSubRows: (node) => node.children,
  });

  return (
    <Accordion
      classNames={{
        chevron: S.chevron,
        content: S.content,
        control: S.control,
        icon: S.icon,
        item: S.item,
        label: S.label,
      }}
    >
      <Accordion.Item value="field-info">
        <Accordion.Control icon={<Icon name="field" />}>
          {t`Field Information`}
        </Accordion.Control>
        <Accordion.Panel>
          <SimpleGrid cols={2} spacing="lg">
            <Stack gap="sm">
              <Title order={5}>{t`Input`}</Title>
              <Card p={0} shadow="none" withBorder>
                <TreeTable instance={sourceInstance} />
              </Card>
            </Stack>

            <Stack gap="sm">
              <Title order={5}>{t`Output`}</Title>
              {target ? (
                <Card p={0} shadow="none" withBorder>
                  <TreeTable instance={targetInstance} />
                </Card>
              ) : (
                <Text c="text-tertiary">{t`No output table`}</Text>
              )}
            </Stack>
          </SimpleGrid>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
};
