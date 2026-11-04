import { t } from "ttag";

import { SidebarSection } from "metabase/common/components/DetailSidebar";
import {
  type HistoryProfile,
  type HistoryVersion,
  countsDurableKeys,
  filtersCurrentRows,
  getFailedChecks,
  getWarningChecks,
  useHistoryReview,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { Box, Button, Group, Icon, Stack, Text } from "metabase/ui";
import type { Field, RowValue, Table } from "metabase-types/api";

import { HistoryPreviewGrid, type PreviewColumn } from "./HistoryPreviewGrid";
import { type EntityNoun, countOf, getDataNote } from "./history-labels";

const PREVIEW_GRID_HEIGHT = 240;

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
        {t`Each row is one record.`}{" "}
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
