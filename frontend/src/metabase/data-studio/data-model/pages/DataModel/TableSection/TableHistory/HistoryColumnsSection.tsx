import { t } from "ttag";

import {
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import {
  type ColumnChangeProfile,
  type ColumnTreatment,
  FAR_FUTURE_VALID_TO,
  type HistoryProfile,
  type HistoryVersion,
  getCurrentRowRuleOptions,
  getFailedChecks,
  getHistorySourceLabel,
  inferHistorySource,
  useHistoryReview,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
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

import { HistoryPreviewGrid, type PreviewColumn } from "./HistoryPreviewGrid";
import {
  type EntityNoun,
  countOf,
  formatDate,
  getCheckDescription,
  getColumnTreatmentDescription,
  getColumnTreatmentOptions,
} from "./history-labels";

const PREVIEW_GRID_HEIGHT = 260;

type ColumnWithTreatment = {
  column: ColumnChangeProfile;
  treatment: ColumnTreatment | null;
};

function useColumnTreatments(table: Table, profile: HistoryProfile) {
  const { getColumnTreatment } = useHistoryReview(table);
  return profile.columns.map(
    (column): ColumnWithTreatment => ({
      column,
      treatment: getColumnTreatment(column),
    }),
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
  const { setColumnTreatment } = useHistoryReview(table);
  const columns = useColumnTreatments(table, profile);
  const changing = columns
    .filter(({ column }) => column.changeCount > 0)
    .sort((a, b) => b.column.changedEntityCount - a.column.changedEntityCount);
  const unchanged = columns.filter(({ column }) => column.changeCount === 0);

  return (
    <SidebarSection title={t`Columns over time`}>
      <Text size="sm" c="text-secondary">
        {t`Which columns change between versions. Pick how each one reads in queries.`}
      </Text>
      <DetailsTable>
        {changing.map(({ column, treatment }) => (
          <Group
            key={getRawTableFieldId(column.field)}
            px="lg"
            py="md"
            gap="lg"
            wrap="nowrap"
            data-testid="history-column"
          >
            <Stack gap={6} flex={1} miw={0}>
              <Group gap="sm" justify="space-between" wrap="nowrap">
                <Text fw="bold" truncate>
                  {column.field.display_name}
                </Text>
                <Text size="sm" c="text-secondary" flex="0 0 auto">
                  {t`${Math.round(
                    (column.changedEntityCount /
                      Math.max(1, profile.entityCount)) *
                      100,
                  )}% of ${noun.other}`}
                </Text>
              </Group>
              <Progress
                value={
                  (column.changedEntityCount /
                    Math.max(1, profile.entityCount)) *
                  100
                }
                size="sm"
              />
              <Text size="sm" c="text-secondary">
                {t`Changed ${column.changeCount.toLocaleString()} times, last on ${formatDate(column.lastChangedAt)}`}
              </Text>
            </Stack>
            <Stack gap={4} w={190} flex="0 0 auto">
              <Select
                aria-label={t`How ${column.field.display_name} reads`}
                data={getColumnTreatmentOptions()}
                value={treatment}
                allowDeselect={false}
                disabled={readOnly}
                size="sm"
                onChange={(value) => {
                  const option = getColumnTreatmentOptions().find(
                    (option) => option.value === value,
                  );
                  if (option) {
                    setColumnTreatment(
                      getRawTableFieldId(column.field),
                      option.value,
                    );
                  }
                }}
              />
              {treatment && (
                <Text size="xs" c="text-secondary">
                  {getColumnTreatmentDescription(treatment)}
                </Text>
              )}
            </Stack>
          </Group>
        ))}
      </DetailsTable>
      {unchanged.length > 0 && (
        <Text size="sm" c="text-secondary">
          {t`Never change: ${unchanged.map(({ column }) => column.field.display_name).join(", ")}. They read the same in every version.`}
        </Text>
      )}
    </SidebarSection>
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
  const binding = getTableStructure(table).history;
  const columns = useColumnTreatments(table, profile).filter(
    ({ column, treatment }) =>
      treatment != null && column.field !== profile.labelField,
  );
  const fields = table.fields ?? [];
  const validFromField = fields.find(
    (field) => getRawTableFieldId(field) === binding.validFromFieldId,
  );
  const validToField = fields.find(
    (field) => getRawTableFieldId(field) === binding.validToFieldId,
  );

  const rows: PreviewRow[] = profile.entities.flatMap((entity) => {
    const latest = entity.versions[entity.versions.length - 1];
    const versions = binding.currentRowsOnly
      ? entity.versions.filter((version) => version.isCurrent)
      : entity.versions;
    return versions.map((version) => ({
      entityKey: entity.key,
      version,
      latest,
    }));
  });

  const previewColumns: PreviewColumn<PreviewRow>[] = [
    {
      id: "durable-key",
      name: profile.durableKeyField.display_name,
      value: (row) => row.entityKey,
    },
    ...(profile.labelField
      ? [
          {
            id: "label",
            name: profile.labelField.display_name,
            value: (row: PreviewRow) =>
              displayValue(row.version.values[profile.labelField?.name ?? ""]),
          },
        ]
      : []),
    ...columns.flatMap(({ column, treatment }) => {
      const name = column.field.name;
      const asItWas: PreviewColumn<PreviewRow> = {
        id: name,
        name: column.field.display_name,
        value: (row) =>
          displayValue(
            treatment === "always-current"
              ? row.latest.values[name]
              : row.version.values[name],
          ),
      };
      const current: PreviewColumn<PreviewRow> = {
        id: `${name}-current`,
        name: t`${column.field.display_name} (current)`,
        value: (row) => displayValue(row.latest.values[name]),
      };
      return treatment === "as-it-was-and-current"
        ? [asItWas, current]
        : [asItWas];
    }),
    ...(validFromField
      ? [
          {
            id: "valid-from",
            name: validFromField.display_name,
            value: (row: PreviewRow) => formatDate(row.version.validFrom),
          },
        ]
      : []),
    ...(validToField
      ? [
          {
            id: "valid-to",
            name: validToField.display_name,
            value: (row: PreviewRow) =>
              row.version.validTo == null
                ? null
                : formatDate(row.version.validTo),
          },
        ]
      : []),
  ];

  return (
    <SidebarSection title={t`What people see`}>
      <Switch
        label={t`Show only the current version`}
        checked={binding.currentRowsOnly}
        disabled={readOnly}
        onChange={(event) =>
          setHistoryBinding(table, { currentRowsOnly: event.target.checked })
        }
        data-testid="history-preview-current-only"
      />
      <Text size="sm" c="text-secondary">
        {binding.currentRowsOnly
          ? t`New questions on ${table.display_name} start with ${rows.length.toLocaleString()} current versions. People can remove the filter to see every version.`
          : t`New questions on ${table.display_name} start with all ${rows.length.toLocaleString()} versions.`}{" "}
        {t`Count gives ${countOf(profile.entityCount, noun)}, the distinct ${profile.durableKeyField.display_name} values, not ${profile.rowCount.toLocaleString()} rows.`}
      </Text>
      <Box
        h={PREVIEW_GRID_HEIGHT}
        bd="1px solid var(--mb-color-border-neutral)"
        bdrs="lg"
        style={{ overflow: "hidden" }}
      >
        <HistoryPreviewGrid
          key={`${binding.currentRowsOnly}:${previewColumns.map((column) => column.id).join()}`}
          rows={rows}
          columns={previewColumns}
        />
      </Box>
    </SidebarSection>
  );
}

export function HistoryMetabotSection({
  table,
  profile,
  noun,
}: {
  table: Table;
  profile: HistoryProfile;
  noun: EntityNoun;
}) {
  const binding = useTableStructures().getTableStructure(table).history;
  const columns = useColumnTreatments(table, profile);
  const fields = table.fields ?? [];
  const nameOf = (fieldId: number | null) =>
    fields.find((field) => getRawTableFieldId(field) === fieldId)?.name ?? "—";
  const columnsWith = (treatment: ColumnTreatment) =>
    columns
      .filter((column) => column.treatment === treatment)
      .map(({ column }) => column.field.name);
  const currentRule =
    binding.currentRowRule === "flag"
      ? `${nameOf(binding.currentFlagFieldId)} = true`
      : (getCurrentRowRuleOptions().find(
          (option) => option.value === binding.currentRowRule,
        )?.label ?? "");
  const issues = getFailedChecks(profile).map((check) =>
    getCheckDescription(check, profile, noun),
  );
  const asItWasAndCurrent = columnsWith("as-it-was-and-current");
  const alwaysCurrent = columnsWith("always-current");

  const lines = [
    `table: ${table.name}`,
    `kind: history (${getHistorySourceLabel(inferHistorySource(fields).source)})`,
    `one row is: one version of a ${noun.one}`,
    `${noun.one} key: ${nameOf(binding.durableKeyFieldId)}  # count distinct for "how many ${noun.other}"`,
    `valid: ${nameOf(binding.validFromFieldId)} <= date < ${nameOf(binding.validToFieldId)}`,
    `current version: ${currentRule}${binding.currentRowRule === "far-future-valid-to" ? ` (${FAR_FUTURE_VALID_TO})` : ""}`,
    `default rows: ${binding.currentRowsOnly ? "current versions only" : "every version"}`,
    `tracked columns: ${[...columnsWith("as-it-was"), ...asItWasAndCurrent].join(", ") || "none"}`,
    ...(asItWasAndCurrent.length > 0
      ? [
          `current-value columns: ${asItWasAndCurrent.map((name) => `${name}_current`).join(", ")}`,
        ]
      : []),
    ...(alwaysCurrent.length > 0
      ? [`always current: ${alwaysCurrent.join(", ")}`]
      : []),
    ...(issues.length > 0 ? [`known issues: ${issues.join(" ")}`] : []),
  ];

  return (
    <SidebarSection title={t`What Metabot reads`}>
      <Text size="sm" c="text-secondary">
        {t`Added to the table's details when Metabot looks at it, so it counts ${noun.other} instead of rows and picks the right version for a date.`}
      </Text>
      <Code block style={{ whiteSpace: "pre-wrap" }}>
        {lines.join("\n")}
      </Code>
    </SidebarSection>
  );
}
