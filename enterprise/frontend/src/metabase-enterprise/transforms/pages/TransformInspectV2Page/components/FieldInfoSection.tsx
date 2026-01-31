import { useState } from "react";
import { t } from "ttag";

import {
  Box,
  Card,
  Collapse,
  Flex,
  SimpleGrid,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "metabase/ui";
import type {
  TransformInspectField,
  TransformInspectSource,
  TransformInspectTarget,
} from "metabase-types/api";

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
  if (value === undefined) return "-";
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(value: string | undefined): string {
  if (!value) return "-";
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
  if (!stats) return null;

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

type FieldRowProps = {
  field: TransformInspectField;
};

const FieldRow = ({ field }: FieldRowProps) => {
  const stats = getFieldStats(field);

  return (
    <Flex
      py={6}
      style={{ borderBottom: "1px solid var(--mb-color-border)" }}
    >
      <Text size="sm" fw={500} style={{ flex: "1 1 0", minWidth: 0 }}>
        {field.display_name ?? field.name}
      </Text>
      <Text size="xs" c="text-tertiary" style={{ width: 80, textAlign: "right", flexShrink: 0 }}>
        {formatType(field)}
      </Text>
      <Text size="xs" c="text-tertiary" style={{ width: 200, textAlign: "right", flexShrink: 0 }}>
        {stats ?? ""}
      </Text>
    </Flex>
  );
};

type FieldListProps = {
  fields: TransformInspectField[];
  tableName: string;
  defaultOpen?: boolean;
};

const FieldList = ({
  fields,
  tableName,
  defaultOpen = true,
}: FieldListProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card p="sm" shadow="none" withBorder>
      <UnstyledButton onClick={() => setIsOpen(!isOpen)} w="100%">
        <Flex gap="sm" align="center">
          <Text size="sm" fw={600}>
            {isOpen ? "▼" : "▶"}
          </Text>
          <Text size="sm" fw={600}>{tableName}</Text>
          <Text size="xs" c="text-tertiary">
            ({fields.length})
          </Text>
        </Flex>
      </UnstyledButton>

      <Collapse in={isOpen}>
        <Box mt="xs">
          {/* Header */}
          <Flex pb={4} style={{ borderBottom: "1px solid var(--mb-color-border)" }}>
            <Text size="xs" c="text-tertiary" fw={600} style={{ flex: "1 1 0" }}>
              {t`Field`}
            </Text>
            <Text size="xs" c="text-tertiary" fw={600} style={{ width: 80, textAlign: "right" }}>
              {t`Type`}
            </Text>
            <Text size="xs" c="text-tertiary" fw={600} style={{ width: 200, textAlign: "right" }}>
              {t`Stats`}
            </Text>
          </Flex>
          {/* Rows */}
          {fields.map((field) => (
            <FieldRow key={field.name} field={field} />
          ))}
        </Box>
      </Collapse>
    </Card>
  );
};

export const FieldInfoSection = ({
  sources,
  target,
}: FieldInfoSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card p="md" shadow="none" withBorder>
      <UnstyledButton onClick={() => setIsExpanded(!isExpanded)} w="100%">
        <Flex gap="sm" align="center">
          <Text fw={600}>{isExpanded ? "▼" : "▶"}</Text>
          <Text fw={600}>{t`Field Information`}</Text>
        </Flex>
      </UnstyledButton>

      <Collapse in={isExpanded}>
        <Box mt="md">
          <SimpleGrid cols={2} spacing="lg">
            <Stack gap="sm">
              <Title order={5}>{t`Input`}</Title>
              {sources.map((source) => (
                <FieldList
                  key={source.table_id ?? source.table_name}
                  fields={source.fields}
                  tableName={source.table_name}
                />
              ))}
            </Stack>

            <Stack gap="sm">
              <Title order={5}>{t`Output`}</Title>
              {target ? (
                <FieldList
                  fields={target.fields}
                  tableName={target.table_name}
                />
              ) : (
                <Text c="text-tertiary">{t`No output table`}</Text>
              )}
            </Stack>
          </SimpleGrid>
        </Box>
      </Collapse>
    </Card>
  );
};
