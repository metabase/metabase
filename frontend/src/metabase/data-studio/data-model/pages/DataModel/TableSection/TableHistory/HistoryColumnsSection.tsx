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
  Group,
  Icon,
  Progress,
  Stack,
  Text,
} from "metabase/ui";
import type { Field, RowValue, Table } from "metabase-types/api";

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
