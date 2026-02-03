import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { getFormattedTime } from "metabase/common/components/DateTime";
import { formatPercent } from "metabase/static-viz/lib/numbers";
import { Icon } from "metabase/ui";
import {
  Accordion,
  Card,
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

import S from "./FieldInfoSection.module.css";

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
    defaultExpanded: {},
  });

  const targetInstance = useTreeTableInstance({
    data: targetData,
    columns,
    getNodeId: (node) => node.id,
    getSubRows: (node) => node.children,
    defaultExpanded: {},
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
                <TreeTable
                  instance={sourceInstance}
                  onRowClick={handleRowClick}
                />
              </Card>
            </Stack>

            <Stack gap="sm">
              <Title order={5}>{t`Output`}</Title>
              {target ? (
                <Card p={0} shadow="none" withBorder>
                  <TreeTable
                    instance={targetInstance}
                    onRowClick={handleRowClick}
                  />
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

function formatNumber(value: number | undefined): string {
  if (value === undefined) {
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
            <Text size="sm" style={{ whiteSpace: "nowrap" }}>
              {node.tableName}
              <Text span size="xs" c="text-tertiary" ml="xs" display="inline">
                ({node.fieldCount})
              </Text>
            </Text>
          );
        }
        return <Text size="sm">{node.fieldName}</Text>;
      },
    },
    {
      id: "type",
      header: t`Type`,
      width: "auto",
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
