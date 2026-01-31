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

function isTemporalField(field: TransformInspectField): boolean {
  return TEMPORAL_BASE_TYPES.has(field.base_type ?? "");
}

function formatFieldType(field: TransformInspectField): string {
  const baseType = field.base_type?.replace("type/", "") ?? "Unknown";
  const semanticType = field.semantic_type?.replace("type/", "");
  if (semanticType && semanticType !== baseType) {
    return `${baseType} (${semanticType})`;
  }
  return baseType;
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

function formatMinMax(
  value: number | string | undefined,
  isTemporal: boolean,
): string {
  if (value === undefined) {
    return "-";
  }
  if (isTemporal && typeof value === "string") {
    // Format ISO date string for display
    try {
      const date = new Date(value);
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return String(value);
    }
  }
  if (typeof value === "number") {
    return formatNumber(value);
  }
  return String(value);
}

type FieldTableProps = {
  fields: TransformInspectField[];
  tableName: string;
  defaultOpen?: boolean;
};

const FieldTable = ({
  fields,
  tableName,
  defaultOpen = true,
}: FieldTableProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const hasStats = fields.some((f) => f.stats);
  const hasTemporalFields = fields.some(
    (f) => f.stats && isTemporalField(f),
  );
  const hasNumericFields = fields.some(
    (f) => f.stats?.avg !== undefined,
  );

  // Choose header labels based on field types present
  const minLabel = hasTemporalFields ? t`Earliest` : t`Min`;
  const maxLabel = hasTemporalFields ? t`Latest` : t`Max`;

  return (
    <Card p="md" shadow="none" withBorder>
      <Stack gap="xs">
        <UnstyledButton onClick={() => setIsOpen(!isOpen)} w="100%">
          <Flex gap="sm" align="center">
            <Text size="sm" fw={600}>
              {isOpen ? "▼" : "▶"}
            </Text>
            <Text fw={600}>{tableName}</Text>
            <Text size="sm" c="text-tertiary">
              ({fields.length} {t`fields`})
            </Text>
          </Flex>
        </UnstyledButton>

        <Collapse in={isOpen}>
          <Stack gap="xs" mt="xs">
            {/* Header row */}
            <Flex
              gap="md"
              fw={600}
              pb="xs"
              style={{ borderBottom: "1px solid var(--mb-color-border)" }}
            >
              <Text style={{ flex: 2 }}>{t`Field`}</Text>
              <Text style={{ flex: 2 }}>{t`Type`}</Text>
              {hasStats && (
                <>
                  <Text style={{ flex: 1 }} ta="right">{t`Distinct`}</Text>
                  <Text style={{ flex: 1 }} ta="right">{t`Null %`}</Text>
                  <Text style={{ flex: 1 }} ta="right">{minLabel}</Text>
                  <Text style={{ flex: 1 }} ta="right">{maxLabel}</Text>
                  {hasNumericFields && (
                    <Text style={{ flex: 1 }} ta="right">{t`Avg`}</Text>
                  )}
                </>
              )}
            </Flex>

            {/* Data rows */}
            {fields.map((field) => {
              const isTemporal = isTemporalField(field);
              return (
                <Flex key={field.name} gap="md" py="xs">
                  <Box style={{ flex: 2 }}>
                    <Text size="sm" fw={500}>
                      {field.display_name ?? field.name}
                    </Text>
                    {field.display_name && field.display_name !== field.name && (
                      <Text size="xs" c="text-tertiary">
                        {field.name}
                      </Text>
                    )}
                  </Box>
                  <Text style={{ flex: 2 }} size="sm">
                    {formatFieldType(field)}
                  </Text>
                  {hasStats && (
                    <>
                      <Text style={{ flex: 1 }} ta="right" size="sm">
                        {formatNumber(field.stats?.distinct_count)}
                      </Text>
                      <Text style={{ flex: 1 }} ta="right" size="sm">
                        {formatPercent(field.stats?.nil_percent)}
                      </Text>
                      <Text style={{ flex: 1 }} ta="right" size="sm">
                        {formatMinMax(field.stats?.min, isTemporal)}
                      </Text>
                      <Text style={{ flex: 1 }} ta="right" size="sm">
                        {formatMinMax(field.stats?.max, isTemporal)}
                      </Text>
                      {hasNumericFields && (
                        <Text style={{ flex: 1 }} ta="right" size="sm">
                          {isTemporal ? "-" : formatNumber(field.stats?.avg)}
                        </Text>
                      )}
                    </>
                  )}
                </Flex>
              );
            })}
          </Stack>
        </Collapse>
      </Stack>
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
          <Text size="sm" c="text-tertiary">
            ({t`types and fingerprints`})
          </Text>
        </Flex>
      </UnstyledButton>

      <Collapse in={isExpanded}>
        <Box mt="md">
          <SimpleGrid cols={2} spacing="lg">
            {/* Left side: Input tables */}
            <Stack gap="md">
              <Title order={5}>{t`Input`}</Title>
              {sources.map((source) => (
                <FieldTable
                  key={source.table_id ?? source.table_name}
                  fields={source.fields}
                  tableName={source.table_name}
                />
              ))}
            </Stack>

            {/* Right side: Output table */}
            <Stack gap="md">
              <Title order={5}>{t`Output`}</Title>
              {target ? (
                <FieldTable
                  fields={target.fields}
                  tableName={target.table_name}
                />
              ) : (
                <Text c="text-tertiary">{t`No output table available`}</Text>
              )}
            </Stack>
          </SimpleGrid>
        </Box>
      </Collapse>
    </Card>
  );
};
