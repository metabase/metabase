import { useDisclosure } from "@mantine/hooks";
import type { ReactNode } from "react";
import { t } from "ttag";

import {
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import {
  type ColumnChangeProfile,
  type HistoryProfile,
  type HistoryVersion,
  type TableStructure,
  countsDurableKeys,
  filtersCurrentRows,
  getFailedChecks,
  getWarningChecks,
  useHistoryReview,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import {
  Box,
  Button,
  Checkbox,
  Code,
  Group,
  Icon,
  Progress,
  Stack,
  Text,
} from "metabase/ui";
import type { Field, RowValue, Table } from "metabase-types/api";

import { describeCurrentRule, getCurrentRule } from "./HistoryBindingRows";
import { HistoryPreviewGrid, type PreviewColumn } from "./HistoryPreviewGrid";
import {
  type EntityNoun,
  countOf,
  formatDate,
  getDataNote,
} from "./history-labels";

const PREVIEW_GRID_HEIGHT = 240;

const shareOf = (count: number, total: number) =>
  Math.round((count / Math.max(1, total)) * 100);

function CollapsibleSection({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  const [isOpen, { toggle }] = useDisclosure(false);
  return (
    <SidebarSection
      title={title}
      titleAside={
        <Button size="compact-sm" variant="subtle" onClick={toggle}>
          {isOpen ? t`Hide` : t`Show`}
        </Button>
      }
    >
      {!isOpen && (
        <Text size="sm" c="text-secondary">
          {summary}
        </Text>
      )}
      {isOpen && children}
    </SidebarSection>
  );
}

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
  const { isCorrectionField, setCorrectionField } = useHistoryReview(table);
  const changing = profile.columns
    .filter((column) => column.changeCount > 0)
    .sort((a, b) => b.changedEntityCount - a.changedEntityCount);
  const unchanged = profile.columns.filter(
    (column) => column.changeCount === 0,
  );
  const correctionCount = changing.filter((column) =>
    isCorrectionField(column.field),
  ).length;

  return (
    <CollapsibleSection
      title={t`Columns over time`}
      summary={t`${changing.length} columns change between versions, ${unchanged.length} never do. ${correctionCount} marked as corrections.`}
    >
      <Text size="sm" c="text-secondary">
        {t`What changed in the checked rows. Only you can say whether a change is history or a correction.`}
      </Text>
      <DetailsTable>
        {changing.map((column) => (
          <ColumnRow
            key={getRawTableFieldId(column.field)}
            column={column}
            profile={profile}
            noun={noun}
            isCorrection={isCorrectionField(column.field)}
            disabled={readOnly}
            onChange={(isCorrection) =>
              setCorrectionField(getRawTableFieldId(column.field), isCorrection)
            }
          />
        ))}
      </DetailsTable>
      {unchanged.length > 0 && (
        <Text size="sm" c="text-secondary">
          {t`Never changed: ${unchanged.map((column) => column.field.display_name).join(", ")}.`}
        </Text>
      )}
    </CollapsibleSection>
  );
}

function ColumnRow({
  column,
  profile,
  noun,
  isCorrection,
  disabled,
  onChange,
}: {
  column: ColumnChangeProfile;
  profile: HistoryProfile;
  noun: EntityNoun;
  isCorrection: boolean;
  disabled: boolean;
  onChange: (isCorrection: boolean) => void;
}) {
  return (
    <Stack px="lg" py="md" gap={6} data-testid="history-column">
      <Group gap="sm" justify="space-between" wrap="nowrap">
        <Text fw="bold" truncate>
          {column.field.display_name}
        </Text>
        <Text size="sm" c="text-secondary" flex="0 0 auto">
          {t`Changed for ${shareOf(column.changedEntityCount, profile.entityCount)}% of ${noun.other}, last on ${formatDate(column.lastChangedAt)}`}
        </Text>
      </Group>
      <Progress
        value={shareOf(column.changedEntityCount, profile.entityCount)}
        size="sm"
      />
      <CorrectionCheckbox
        fieldName={column.field.display_name}
        checked={isCorrection}
        disabled={disabled}
        onChange={onChange}
      />
    </Stack>
  );
}

export function CorrectionCheckbox({
  fieldName,
  checked,
  disabled,
  onChange,
}: {
  fieldName: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Checkbox
      label={t`Changes are corrections — always show the latest value`}
      aria-label={t`Changes to ${fieldName} are corrections`}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
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
  isCorrectionField: (field: Field) => boolean,
): PreviewColumn<PreviewRow>[] {
  const labelField = profile.labelField;
  const valueColumns = profile.columns
    .filter((column) => column.changeCount > 0 && column.field !== labelField)
    .map((column): PreviewColumn<PreviewRow> => {
      const name = column.field.name;
      const isCorrection = isCorrectionField(column.field);
      return {
        id: name,
        name: column.field.display_name,
        value: (row) =>
          displayValue(
            isCorrection ? row.latest.values[name] : row.version.values[name],
          ),
      };
    });
  return [
    {
      id: "entity-key",
      name: profile.durableKeyField.display_name,
      value: (row) => row.entityKey,
    },
    ...(labelField
      ? [
          {
            id: "label",
            name: labelField.display_name,
            value: (row: PreviewRow) =>
              displayValue(
                isCorrectionField(labelField)
                  ? row.latest.values[labelField.name]
                  : row.version.values[labelField.name],
              ),
          },
        ]
      : []),
    ...valueColumns,
  ];
}

export function getDataNotes(profile: HistoryProfile, noun: EntityNoun) {
  return [...getFailedChecks(profile), ...getWarningChecks(profile)]
    .map((check) => getDataNote(check, noun))
    .filter((note) => note != null);
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
  const { isCorrectionField } = useHistoryReview(table);
  const structure = getTableStructure(table);
  const canFilter = filtersCurrentRows(structure.scdType);
  const showsCurrentRecords = canFilter && structure.history.currentRowsOnly;
  const currentVersions = profile.entities.flatMap((entity) =>
    entity.versions.filter((version) => version.isCurrent),
  );
  const currentEntityCount = profile.entities.filter((entity) =>
    entity.versions.some((version) => version.isCurrent),
  ).length;

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
  const previewColumns = getPreviewColumns(profile, isCorrectionField);
  const dataNotes = getDataNotes(profile, noun);

  return (
    <SidebarSection title={t`What people see`}>
      <Text>
        {t`Each row is one ${noun.one} record.`}{" "}
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
          canFilter && (
            <Button
              size="compact-sm"
              variant="subtle"
              px={0}
              disabled={readOnly}
              onClick={() =>
                setHistoryBinding(table, { currentRowsOnly: true })
              }
            >
              {t`Start on current records`}
            </Button>
          )
        )}
      </Group>
      <Group gap="xl" align="flex-start">
        <Stack gap={0}>
          <Text size="sm" c="text-secondary">{t`All records`}</Text>
          <Text fw="bold">
            {t`${countOf(profile.entityCount, noun)} in ${profile.rowCount.toLocaleString()} records`}
          </Text>
        </Stack>
        {canFilter && (
          <Stack gap={0}>
            <Text size="sm" c="text-secondary">{t`Current records only`}</Text>
            <Text fw="bold">
              {t`${countOf(currentEntityCount, noun)} in ${currentVersions.length.toLocaleString()} records`}
            </Text>
          </Stack>
        )}
      </Group>
      <Text size="sm" c="text-secondary">
        {countsDurableKeys(structure.scdType)
          ? t`“Number of ${noun.other}” counts each ${noun.one} once. “Number of records” comes last.`
          : t`Counts stay plain row counts.`}
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
      {dataNotes.length > 0 && (
        <Stack gap={4}>
          {dataNotes.map((note) => (
            <Group key={note} gap="xs" wrap="nowrap">
              <Icon name="info" size={12} c="text-secondary" />
              <Text size="sm" c="text-secondary">
                {note}
              </Text>
            </Group>
          ))}
        </Stack>
      )}
    </SidebarSection>
  );
}

const yamlValue = (value: string | null | undefined) => value ?? "null";

export function getAgentSentences({
  table,
  structure,
  profile,
  noun,
  isConfirmed,
  correctionNames,
  dataNotes,
}: {
  table: Pick<Table, "name" | "fields">;
  structure: TableStructure;
  profile: HistoryProfile;
  noun: EntityNoun;
  isConfirmed: boolean;
  correctionNames: string[];
  dataNotes: string[];
}) {
  const fields = table.fields ?? [];
  const nameOf = (fieldId: number | null) =>
    fields.find((field) => getRawTableFieldId(field) === fieldId)?.name ??
    t`an unknown column`;
  const keyName = profile.durableKeyField.name;
  const isProposedRule =
    getCurrentRule(structure) === "latest-per-key" && !isConfirmed;
  const currentRule = describeCurrentRule(structure, fields);

  const counting = countsDurableKeys(structure.scdType)
    ? t`Each row of ${table.name} is one version of a ${noun.one}. Count ${noun.other} with distinct ${keyName}, not rows.`
    : t`Each row of ${table.name} is its own record, so plain counts are right.`;
  const current = isProposedRule
    ? t`The current version is probably ${currentRule}, but nobody has confirmed that rule, so say so when you rely on it.`
    : t`The current version is ${currentRule}, and a version is valid from ${nameOf(structure.history.validFromFieldId)} until ${nameOf(structure.history.validToFieldId)}.`;
  const attributes = [
    correctionNames.length > 0
      ? t`Changes to ${correctionNames.join(", ")} are corrections, so use the latest value; other columns are as they were in each version.`
      : t`Other columns are as they were in each version.`,
    ...dataNotes,
  ].join(" ");
  return [counting, current, attributes];
}

export function getAgentYaml({
  table,
  structure,
  correctionNames,
  dataNotes,
}: {
  table: Pick<Table, "fields">;
  structure: TableStructure;
  correctionNames: string[];
  dataNotes: string[];
}) {
  const fields = table.fields ?? [];
  const binding = structure.history;
  const nameOf = (fieldId: number | null) =>
    fields.find((field) => getRawTableFieldId(field) === fieldId)?.name;
  const showsCurrentRecords =
    filtersCurrentRows(structure.scdType) && binding.currentRowsOnly;
  return [
    `history:`,
    `  durable_key: ${yamlValue(nameOf(binding.durableKeyFieldId))}`,
    `  valid_from: ${yamlValue(nameOf(binding.validFromFieldId))}`,
    `  valid_to: ${yamlValue(nameOf(binding.validToFieldId))}`,
    `  current_flag: ${yamlValue(nameOf(binding.currentFlagFieldId))}`,
    `  version: ${yamlValue(nameOf(binding.versionFieldId))}`,
    `scd_type: ${structure.scdType ?? "null"}`,
    `default_scope: ${showsCurrentRecords ? "{ segment: current_rows }" : "null"}`,
    ...(correctionNames.length > 0
      ? [
          `fields:`,
          ...correctionNames.map(
            (name) => `  ${name}: { attribute_scd_type: 1 }`,
          ),
        ]
      : []),
    ...(dataNotes.length > 0
      ? [`data_notes:`, ...dataNotes.map((note) => `  - ${note}`)]
      : []),
  ].join("\n");
}

export function HistoryAgentContext({
  table,
  profile,
  noun,
}: {
  table: Table;
  profile: HistoryProfile;
  noun: EntityNoun;
}) {
  const structure = useTableStructures().getTableStructure(table);
  const { isConfirmed, isCorrectionField } = useHistoryReview(table);
  const correctionNames = (table.fields ?? [])
    .filter((field) => isCorrectionField(field))
    .map((field) => field.name);
  const dataNotes = getDataNotes(profile, noun);
  const sentences = getAgentSentences({
    table,
    structure,
    profile,
    noun,
    isConfirmed: isConfirmed(structure),
    correctionNames,
    dataNotes,
  });

  return (
    <CollapsibleSection
      title={t`What agents read`}
      summary={t`What Metabot and MB-Code get about this table: three sentences and the exported metadata.`}
    >
      <Stack gap="xs">
        {sentences.map((sentence) => (
          <Text key={sentence} size="sm">
            {sentence}
          </Text>
        ))}
      </Stack>
      <Code block style={{ whiteSpace: "pre-wrap" }}>
        {getAgentYaml({ table, structure, correctionNames, dataNotes })}
      </Code>
    </CollapsibleSection>
  );
}
