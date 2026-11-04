import { t } from "ttag";

import {
  type ResolvedEavBinding,
  usePropertyRegistry,
  usePropertySampleRows,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  Badge,
  Code,
  Group,
  Icon,
  Paper,
  SimpleGrid,
  Stack,
  Text,
} from "metabase/ui";
import type { FieldId, Table } from "metabase-types/api";

import { getEntityNoun } from "../../PropertyDetailsPanel/property-labels";

import { formatPropertyValue, pivotSampleRows } from "./pivot-preview";

const RAW_ROW_COUNT = 3;
const PREVIEW_PROPERTY_COUNT = 6;

export function RecognitionPreview({
  table,
  resolved,
}: {
  table: Table;
  resolved: ResolvedEavBinding;
}) {
  const { getTableStructure } = useTableStructures();
  const { inference, isRoleOverridden } = getTableStructure(table);
  const samples = usePropertySampleRows(table);
  const state = usePropertyRegistry(table);
  const { binding, entityTable } = resolved;
  const fields = table.fields ?? [];
  const nameOf = (fieldId: FieldId | null) =>
    fields.find((field) => getRawTableFieldId(field) === fieldId)?.name ?? "";

  if (!samples || state.status !== "loaded" || samples.length === 0) {
    return null;
  }

  const rawRows = samples.slice(0, RAW_ROW_COUNT);
  const [firstEntity] = pivotSampleRows(
    samples.filter(({ entityKey }) => entityKey === rawRows[0].entityKey),
    state.registry.properties,
  );
  const previewProperties = state.registry.properties
    .filter(
      (property) =>
        property.isSuggestedForPivot &&
        firstEntity.valuesByProperty.has(property.key),
    )
    .slice(0, PREVIEW_PROPERTY_COUNT);
  const noun = getEntityNoun(entityTable);

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <Group gap="sm" wrap="nowrap">
          <Badge variant="light" color="positive" flex="0 0 auto">
            {t`Recognised`}
          </Badge>
          <Text size="sm" c="text-secondary">
            {isRoleOverridden
              ? t`Set by an admin`
              : t`Inferred: ${inference.signal}`}
          </Text>
        </Group>
        <SimpleGrid cols={3} spacing="xs" verticalSpacing={4}>
          {[
            binding.entityKeyFieldId,
            binding.propertyFieldId,
            binding.valueFieldId,
          ].map((fieldId) => (
            <Text key={fieldId} size="sm" c="text-secondary" ff="monospace">
              {nameOf(fieldId)}
            </Text>
          ))}
          {rawRows.flatMap((row, index) =>
            [row.entityKey, row.propertyKey, row.value].map((value, column) => (
              <Code key={`${index}:${column}`} w="fit-content">
                {String(value)}
              </Code>
            )),
          )}
        </SimpleGrid>
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <Icon name="arrow_down" c="text-secondary" mt={2} />
          <Stack gap={4}>
            <Text size="sm" c="text-secondary">
              {t`Read as one ${noun.singular} with its properties`}
            </Text>
            <Text fw="bold">
              {t`${noun.title} ${String(firstEntity.entityKey)}`}
            </Text>
            <Group gap="md">
              {previewProperties.map((property) => (
                <Text key={property.key} size="sm">
                  <Text span c="text-secondary">
                    {property.displayName}
                  </Text>{" "}
                  {formatPropertyValue(
                    property,
                    firstEntity.valuesByProperty.get(property.key),
                  ) ?? "—"}
                </Text>
              ))}
            </Group>
          </Stack>
        </Group>
      </Stack>
    </Paper>
  );
}
