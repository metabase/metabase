import { t } from "ttag";

import {
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import {
  ATTRIBUTE_SCD_TYPES,
  type AttributeScdType,
  type AttributeScdTypeSuggestion,
  type ColumnChangeProfile,
  type HistoryProfile,
  type HistoryVersion,
  countsDurableKeys,
  filtersCurrentRows,
  getAttributeScdTypeDescription,
  getAttributeScdTypeLabel,
  getFailedChecks,
  isAttributeScdType,
  useHistoryReview,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import {
  Box,
  Code,
  Group,
  Progress,
  Select,
  Stack,
  Switch,
  Text,
} from "metabase/ui";
import type { RowValue, Table } from "metabase-types/api";

import { getCurrentRowsCondition } from "./HistoryBindingRows";
import { HistoryPreviewGrid, type PreviewColumn } from "./HistoryPreviewGrid";
import {
  type EntityNoun,
  countOf,
  formatDate,
  getCheckDescription,
} from "./history-labels";

const PREVIEW_GRID_HEIGHT = 260;

type ColumnWithScdType = {
  column: ColumnChangeProfile;
  attributeScdType: AttributeScdType;
  isOverridden: boolean;
  suggestion: AttributeScdTypeSuggestion;
};

function useColumnScdTypes(table: Table, profile: HistoryProfile) {
  const { getAttributeScdType } = useHistoryReview(table);
  return profile.columns.map(
    (column): ColumnWithScdType => ({
      column,
      ...getAttributeScdType(column.field, column, profile.entityCount),
    }),
  );
}

const shareOf = (count: number, total: number) =>
  Math.round((count / Math.max(1, total)) * 100);

export function HistoryColumnsSection({
  table,
  profile,
  noun,
  readOnly,
}: {
  table: Table;
  profile: HistoryProfile;
  noun: EntityNoun;
  readOnly: boolean;
}) {
  const { setAttributeScdType } = useHistoryReview(table);
  const columns = useColumnScdTypes(table, profile);
  const changing = columns
    .filter(({ column }) => column.changeCount > 0)
    .sort((a, b) => b.column.changedEntityCount - a.column.changedEntityCount);
  const unchanged = columns.filter(({ column }) => column.changeCount === 0);

  return (
    <SidebarSection title={t`Columns over time`}>
      <Text size="sm" c="text-secondary">
        {t`Which columns change between versions, and each column's attribute SCD type. Unset types follow what the data shows.`}
      </Text>
      <DetailsTable>
        {changing.map(
          ({ column, attributeScdType, isOverridden, suggestion }) => (
            <Group
              key={getRawTableFieldId(column.field)}
              px="lg"
              py="md"
              gap="lg"
              wrap="nowrap"
              align="flex-start"
              data-testid="history-column"
            >
              <Stack gap={6} flex={1} miw={0}>
                <Group gap="sm" justify="space-between" wrap="nowrap">
                  <Text fw="bold" truncate>
                    {column.field.display_name}
                  </Text>
                  <Text size="sm" c="text-secondary" flex="0 0 auto">
                    {t`${shareOf(column.changedEntityCount, profile.entityCount)}% of ${noun.other}`}
                  </Text>
                </Group>
                <Progress
                  value={shareOf(
                    column.changedEntityCount,
                    profile.entityCount,
                  )}
                  size="sm"
                />
                <Text size="sm" c="text-secondary">
                  {t`Changed ${column.changeCount.toLocaleString()} times, last on ${formatDate(column.lastChangedAt)}`}
                </Text>
              </Stack>
              <Stack gap={4} w={200} flex="0 0 auto">
                <AttributeScdTypeSelect
                  label={t`Attribute SCD type of ${column.field.display_name}`}
                  value={attributeScdType}
                  disabled={readOnly}
                  onChange={(value) =>
                    setAttributeScdType(getRawTableFieldId(column.field), value)
                  }
                />
                <Text size="xs" c="text-secondary">
                  {isOverridden
                    ? getAttributeScdTypeDescription(attributeScdType)
                    : t`Not set. Suggests type ${suggestion.attributeScdType}: ${suggestion.reason}`}
                </Text>
              </Stack>
            </Group>
          ),
        )}
      </DetailsTable>
      {unchanged.length > 0 && (
        <Text size="sm" c="text-secondary">
          {t`Never change, so suggested as type 0: ${unchanged.map(({ column }) => column.field.display_name).join(", ")}.`}
        </Text>
      )}
    </SidebarSection>
  );
}

export function AttributeScdTypeSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: AttributeScdType;
  disabled: boolean;
  onChange: (value: AttributeScdType) => void;
}) {
  return (
    <Select
      aria-label={label}
      data={ATTRIBUTE_SCD_TYPES.map((type) => ({
        value: String(type),
        label: getAttributeScdTypeLabel(type),
      }))}
      value={String(value)}
      allowDeselect={false}
      disabled={disabled}
      size="sm"
      onOptionSubmit={(selected) => {
        const type = Number(selected);
        if (isAttributeScdType(type)) {
          onChange(type);
        }
      }}
    />
  );
}

type PreviewRow = {
  entityKey: string;
  version: HistoryVersion;
  latest: HistoryVersion;
};

function displayValue(value: RowValue | undefined) {
  if (value == null) {
    return null;
  }
  return typeof value === "object" ? JSON.stringify(value) : value;
}

function getPreviewColumns(
  profile: HistoryProfile,
  columns: ColumnWithScdType[],
  addsCurrentValueColumns: boolean,
): PreviewColumn<PreviewRow>[] {
  const labelField = profile.labelField;
  const valueColumns = columns
    .filter(
      ({ column }) => column.changeCount > 0 && column.field !== labelField,
    )
    .flatMap(({ column, attributeScdType }) => {
      const name = column.field.name;
      const asItWas: PreviewColumn<PreviewRow> = {
        id: name,
        name: column.field.display_name,
        value: (row) =>
          displayValue(
            attributeScdType === 1
              ? row.latest.values[name]
              : row.version.values[name],
          ),
      };
      const current: PreviewColumn<PreviewRow> = {
        id: `${name}-current`,
        name: t`${column.field.display_name} (current)`,
        value: (row) => displayValue(row.latest.values[name]),
      };
      return addsCurrentValueColumns && attributeScdType === 2
        ? [asItWas, current]
        : [asItWas];
    });
  return [
    {
      id: "durable-key",
      name: profile.durableKeyField.display_name,
      value: (row) => row.entityKey,
    },
    ...(labelField
      ? [
          {
            id: "label",
            name: labelField.display_name,
            value: (row: PreviewRow) =>
              displayValue(row.version.values[labelField.name]),
          },
        ]
      : []),
    ...valueColumns,
  ];
}

export function HistoryPreviewSection({
  table,
  profile,
  noun,
  readOnly,
}: {
  table: Table;
  profile: HistoryProfile;
  noun: EntityNoun;
  readOnly: boolean;
}) {
  const { getTableStructure, setHistoryBinding } = useTableStructures();
  const structure = getTableStructure(table);
  const binding = structure.history;
  const columns = useColumnScdTypes(table, profile);
  const showsCurrentRecords =
    filtersCurrentRows(structure.scdType) && binding.currentRowsOnly;
  const countsEntities = countsDurableKeys(structure.scdType);

  const rows: PreviewRow[] = profile.entities.flatMap((entity) => {
    const latest = entity.versions[entity.versions.length - 1];
    const versions = showsCurrentRecords
      ? entity.versions.filter((version) => version.isCurrent)
      : entity.versions;
    return versions.map((version) => ({
      entityKey: entity.key,
      version,
      latest,
    }));
  });
  const previewColumns = getPreviewColumns(
    profile,
    columns,
    structure.scdType === 6,
  );

  return (
    <SidebarSection title={t`What people see`}>
      <Text size="sm" c="text-secondary">
        {t`A new question on ${table.display_name}, as someone who doesn't know it's a history table sees it.`}
      </Text>
      <Text>
        {t`Each row is one ${noun.one} record. ${countOf(profile.entityCount, noun)} in ${profile.rowCount.toLocaleString()} records.`}{" "}
        {showsCurrentRecords && <strong>{t`Showing current records.`}</strong>}
      </Text>
      <Group gap="sm">
        {showsCurrentRecords ? (
          <FilterPill
            onRemoveClick={() =>
              setHistoryBinding(table, { currentRowsOnly: false })
            }
          >
            {t`Current records only`}
          </FilterPill>
        ) : (
          <Switch
            label={t`Start on current records`}
            checked={false}
            disabled={readOnly || !filtersCurrentRows(structure.scdType)}
            onChange={() => setHistoryBinding(table, { currentRowsOnly: true })}
          />
        )}
      </Group>
      <Text size="sm" c="text-secondary">
        {countsEntities
          ? t`“Number of ${noun.other}” counts each ${noun.one} once: count-distinct(${profile.durableKeyField.name}) = ${profile.entityCount.toLocaleString()}. “Number of records” (${profile.rowCount.toLocaleString()}) comes last.`
          : t`Counts stay plain row counts for this SCD type.`}
      </Text>
      <Box
        h={PREVIEW_GRID_HEIGHT}
        bd="1px solid var(--mb-color-border-neutral)"
        bdrs="lg"
        style={{ overflow: "hidden" }}
      >
        <HistoryPreviewGrid
          key={`${showsCurrentRecords}:${previewColumns.map((column) => column.id).join()}`}
          rows={rows}
          columns={previewColumns}
        />
      </Box>
    </SidebarSection>
  );
}

const yamlValue = (value: string | null | undefined) => value ?? "null";

export function HistoryRepresentationSection({
  table,
  profile,
  noun,
}: {
  table: Table;
  profile: HistoryProfile;
  noun: EntityNoun;
}) {
  const structure = useTableStructures().getTableStructure(table);
  const binding = structure.history;
  const columns = useColumnScdTypes(table, profile);
  const fields = table.fields ?? [];
  const nameOf = (fieldId: number | null) =>
    fields.find((field) => getRawTableFieldId(field) === fieldId)?.name;
  const showsCurrentRecords =
    filtersCurrentRows(structure.scdType) && binding.currentRowsOnly;
  const setAttributeTypes = columns.filter(({ isOverridden }) => isOverridden);
  const issues = getFailedChecks(profile).map((check) =>
    getCheckDescription(check, profile, noun),
  );

  const yaml = [
    `history:`,
    `  durable_key: ${yamlValue(nameOf(binding.durableKeyFieldId))}`,
    `  valid_from: ${yamlValue(nameOf(binding.validFromFieldId))}`,
    `  valid_to: ${yamlValue(nameOf(binding.validToFieldId))}`,
    `  current_flag: ${yamlValue(nameOf(binding.currentFlagFieldId))}`,
    `  version: ${yamlValue(nameOf(binding.versionFieldId))}`,
    `scd_type: ${structure.scdType ?? "null"}`,
    `default_scope: ${showsCurrentRecords ? "{ segment: current_rows }" : "null"}`,
    ...(setAttributeTypes.length > 0
      ? [
          `fields:`,
          ...setAttributeTypes.map(
            ({ column, attributeScdType }) =>
              `  ${column.field.name}: { attribute_scd_type: ${attributeScdType} }`,
          ),
        ]
      : []),
  ];

  const metabotNotes = [
    countsDurableKeys(structure.scdType)
      ? t`Counting rows over-counts ${noun.other}: use count-distinct(${profile.durableKeyField.name}).`
      : t`Plain row counts are right for this SCD type.`,
    t`Current version: ${getCurrentRowsCondition(structure, fields)}.`,
    ...issues.map((issue) => t`Known issue: ${issue}`),
  ];

  return (
    <SidebarSection title={t`Representation`}>
      <Text size="sm" c="text-secondary">
        {t`What this table exports as, and what Metabot reads about it.`}
      </Text>
      <Code block style={{ whiteSpace: "pre-wrap" }}>
        {yaml.join("\n")}
      </Code>
      <Stack gap={4}>
        <Text fw="bold" size="sm">{t`Metabot`}</Text>
        {metabotNotes.map((note) => (
          <Text key={note} size="sm" c="text-secondary">
            {note}
          </Text>
        ))}
      </Stack>
    </SidebarSection>
  );
}
