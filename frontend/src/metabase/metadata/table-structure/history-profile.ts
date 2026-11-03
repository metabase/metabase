import _ from "underscore";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type {
  Dataset,
  Field,
  FieldId,
  RowValue,
  StructuredDatasetQuery,
  Table,
} from "metabase-types/api";

import type { CurrentRowRule } from "./history-source";
import type { HistoryBinding } from "./inference";

export const HISTORY_CHECK_IDS = [
  "durable-key",
  "one-current",
  "overlap",
  "gap",
  "valid-range",
  "has-current",
] as const;

export type HistoryCheckId = (typeof HISTORY_CHECK_IDS)[number];

export type HistoryCheckStatus = "passed" | "failed" | "warning";

export type HistoryCheck = {
  id: HistoryCheckId;
  status: HistoryCheckStatus;
  entityKeys: string[];
};

export type HistoryVersion = {
  rowIndex: number;
  versionKey: string | null;
  validFrom: string | null;
  validTo: string | null;
  isOpen: boolean;
  isCurrent: boolean;
  values: Record<string, RowValue>;
};

export type HistoryEntity = {
  key: string;
  label: string | null;
  versions: HistoryVersion[];
  issues: HistoryCheckId[];
};

export type ColumnChangeProfile = {
  field: Field;
  changedEntityCount: number;
  changeCount: number;
  lastChangedAt: string | null;
};

export type HistoryProfile = {
  rowCount: number;
  entityCount: number;
  currentRowCount: number;
  maxVersionCount: number;
  firstValidFrom: string | null;
  lastValidFrom: string | null;
  durableKeyField: Field;
  labelField: Field | undefined;
  entities: HistoryEntity[];
  checks: HistoryCheck[];
  columns: ColumnChangeProfile[];
};

export type HistoryProfileState =
  | { status: "unbound"; missing: ("durable-key" | "valid-from")[] }
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "loaded"; profile: HistoryProfile };

type HistoryTable = Pick<Table, "db_id" | "id"> & { fields?: Field[] };

type BoundHistory = {
  durableKeyField: Field;
  validFromField: Field;
  validToField: Field | undefined;
  versionKeyField: Field | undefined;
  currentFlagField: Field | undefined;
  currentRowRule: CurrentRowRule;
};

const PROFILE_ROW_LIMIT = 10000;
const SEAM_TOLERANCE_MS = 1000;
const FAR_FUTURE_PREFIX = "9999";
const LABEL_RE = /(^|_)(name|title|display_name)$/;
const BOOKKEEPING_RE =
  /^dbt_|^_fivetran_|(^|_)(updated_at|updated|modified_at|synced_at|loaded_at)$/;
const TRUTHY_FLAGS = new Set(["true", "t", "y", "yes", "1"]);

const findField = (fields: Field[], fieldId: FieldId | null) =>
  fieldId == null
    ? undefined
    : fields.find((field) => getRawTableFieldId(field) === fieldId);

function getBoundHistory(
  fields: Field[],
  binding: HistoryBinding,
): BoundHistory | HistoryProfileState {
  const durableKeyField = findField(fields, binding.durableKeyFieldId);
  const validFromField = findField(fields, binding.validFromFieldId);
  if (!durableKeyField || !validFromField) {
    return {
      status: "unbound",
      missing: [
        ...(durableKeyField ? [] : ["durable-key" as const]),
        ...(validFromField ? [] : ["valid-from" as const]),
      ],
    };
  }
  return {
    durableKeyField,
    validFromField,
    validToField: findField(fields, binding.validToFieldId),
    versionKeyField: findField(fields, binding.versionKeyFieldId),
    currentFlagField: findField(fields, binding.currentFlagFieldId),
    currentRowRule: binding.currentRowRule,
  };
}

const isBoundHistory = (
  value: BoundHistory | HistoryProfileState,
): value is BoundHistory => "durableKeyField" in value;

export function getHistoryProfileQuery(
  table: HistoryTable,
): StructuredDatasetQuery {
  return {
    database: table.db_id,
    type: "query",
    query: { "source-table": table.id, limit: PROFILE_ROW_LIMIT },
  };
}

const toText = (value: RowValue | undefined) =>
  value == null ? null : String(value);

const isFarFuture = (value: string | null) =>
  value != null && value.startsWith(FAR_FUTURE_PREFIX);

function isTruthyFlag(value: RowValue | undefined) {
  return value === true || TRUTHY_FLAGS.has(String(value).toLowerCase());
}

function isCurrentVersion(
  rule: CurrentRowRule,
  validTo: string | null,
  flag: RowValue | undefined,
) {
  switch (rule) {
    case "flag":
      return isTruthyFlag(flag);
    case "open-valid-to":
      return validTo == null;
    case "far-future-valid-to":
      return validTo == null || isFarFuture(validTo);
  }
}

function readVersions(dataset: Dataset, fields: Field[], bound: BoundHistory) {
  const { cols, rows } = dataset.data;
  const columnIndexByName = new Map(
    cols.map((col, index) => [col.name, index]),
  );
  const readValue = (row: RowValue[], field: Field | undefined) => {
    const index = field ? columnIndexByName.get(field.name) : undefined;
    return index == null ? undefined : row[index];
  };

  return rows.map((row, rowIndex) => {
    const validTo = toText(readValue(row, bound.validToField));
    return {
      entityKey: toText(readValue(row, bound.durableKeyField)) ?? "",
      version: {
        rowIndex,
        versionKey: toText(readValue(row, bound.versionKeyField)),
        validFrom: toText(readValue(row, bound.validFromField)),
        validTo,
        isOpen: validTo == null || isFarFuture(validTo),
        isCurrent: isCurrentVersion(
          bound.currentRowRule,
          validTo,
          readValue(row, bound.currentFlagField),
        ),
        values: Object.fromEntries(
          fields.map((field) => [field.name, readValue(row, field) ?? null]),
        ),
      } satisfies HistoryVersion,
    };
  });
}

const toTime = (value: string | null) =>
  value == null ? null : Date.parse(value);

function compareSeam(previous: HistoryVersion, next: HistoryVersion) {
  const start = toTime(next.validFrom);
  const end = toTime(previous.validTo);
  if (start == null) {
    return "contiguous";
  }
  if (previous.isOpen) {
    return "overlap";
  }
  if (end == null) {
    return "contiguous";
  }
  if (end > start) {
    return "overlap";
  }
  return start - end > SEAM_TOLERANCE_MS ? "gap" : "contiguous";
}

function endsBeforeItStarts(version: HistoryVersion) {
  const start = toTime(version.validFrom);
  const end = toTime(version.validTo);
  return !version.isOpen && start != null && end != null && end <= start;
}

function getEntityIssues(versions: HistoryVersion[]): HistoryCheckId[] {
  const seams = versions
    .slice(1)
    .map((next, index) => compareSeam(versions[index], next));
  const currentCount = versions.filter((version) => version.isCurrent).length;
  const issues: [HistoryCheckId, boolean][] = [
    ["one-current", currentCount > 1],
    ["overlap", seams.includes("overlap")],
    ["gap", seams.includes("gap")],
    ["valid-range", versions.some(endsBeforeItStarts)],
    ["has-current", currentCount === 0],
  ];
  return issues.filter(([, hasIssue]) => hasIssue).map(([id]) => id);
}

const CHECK_STATUS_WHEN_FOUND: Record<HistoryCheckId, HistoryCheckStatus> = {
  "durable-key": "failed",
  "one-current": "failed",
  overlap: "failed",
  gap: "warning",
  "valid-range": "failed",
  "has-current": "warning",
};

function getChecks(
  entities: HistoryEntity[],
  rowCount: number,
  bound: BoundHistory,
): HistoryCheck[] {
  const isDurableKeyPerVersion =
    (rowCount > 1 && entities.length === rowCount) ||
    bound.versionKeyField === bound.durableKeyField;
  return HISTORY_CHECK_IDS.map((id) => {
    if (id === "durable-key") {
      return {
        id,
        status: isDurableKeyPerVersion ? "failed" : "passed",
        entityKeys: [],
      };
    }
    const entityKeys = entities
      .filter((entity) => entity.issues.includes(id))
      .map((entity) => entity.key);
    return {
      id,
      status: entityKeys.length > 0 ? CHECK_STATUS_WHEN_FOUND[id] : "passed",
      entityKeys,
    };
  });
}

const maxText = (values: (string | null)[]) =>
  values.reduce<string | null>(
    (max, value) =>
      value != null && (max == null || value > max) ? value : max,
    null,
  );

const minText = (values: (string | null)[]) =>
  values.reduce<string | null>(
    (min, value) =>
      value != null && (min == null || value < min) ? value : min,
    null,
  );

function getColumnProfiles(
  entities: HistoryEntity[],
  fields: Field[],
  bound: BoundHistory,
): ColumnChangeProfile[] {
  const boundFields = new Set(
    [
      bound.durableKeyField,
      bound.validFromField,
      bound.validToField,
      bound.versionKeyField,
      bound.currentFlagField,
    ].filter((field) => field != null),
  );
  return fields
    .filter((field) => !boundFields.has(field))
    .filter((field) => !BOOKKEEPING_RE.test(field.name.toLowerCase()))
    .map((field) => {
      const changes = entities.flatMap((entity) =>
        entity.versions.slice(1).flatMap((version, index) => {
          const previous = entity.versions[index];
          const isChanged = !_.isEqual(
            previous.values[field.name],
            version.values[field.name],
          );
          return isChanged ? [{ entity, at: version.validFrom }] : [];
        }),
      );
      return {
        field,
        changedEntityCount: new Set(changes.map((change) => change.entity.key))
          .size,
        changeCount: changes.length,
        lastChangedAt: maxText(changes.map((change) => change.at)),
      };
    });
}

export function buildHistoryProfile(
  dataset: Dataset,
  fields: Field[],
  bound: BoundHistory,
): HistoryProfile {
  const rows = readVersions(dataset, fields, bound);
  const labelField = fields.find(
    (field) =>
      field !== bound.durableKeyField &&
      LABEL_RE.test(field.name.toLowerCase()),
  );
  const entities = Object.entries(_.groupBy(rows, (row) => row.entityKey)).map(
    ([key, entityRows]): HistoryEntity => {
      const versions = _.sortBy(
        entityRows.map((row) => row.version),
        (version) => version.validFrom ?? "",
      );
      const latest = versions[versions.length - 1];
      return {
        key,
        label: labelField ? toText(latest.values[labelField.name]) : null,
        versions,
        issues: getEntityIssues(versions),
      };
    },
  );
  const validFroms = rows.map((row) => row.version.validFrom);

  return {
    rowCount: rows.length,
    entityCount: entities.length,
    currentRowCount: rows.filter((row) => row.version.isCurrent).length,
    maxVersionCount: Math.max(
      0,
      ...entities.map((entity) => entity.versions.length),
    ),
    firstValidFrom: minText(validFroms),
    lastValidFrom: maxText(validFroms),
    durableKeyField: bound.durableKeyField,
    labelField,
    entities,
    checks: getChecks(entities, rows.length, bound),
    columns: getColumnProfiles(entities, fields, bound),
  };
}

export function useHistoryProfile(
  table: HistoryTable,
  binding: HistoryBinding,
  { skip = false }: { skip?: boolean } = {},
): HistoryProfileState {
  const fields = table.fields ?? [];
  const bound = getBoundHistory(fields, binding);
  const { data, error } = useGetAdhocQueryQuery(
    !skip && isBoundHistory(bound) ? getHistoryProfileQuery(table) : skipToken,
  );

  if (!isBoundHistory(bound)) {
    return bound;
  }
  if (error) {
    return { status: "error", error };
  }
  if (!data) {
    return { status: "loading" };
  }
  return {
    status: "loaded",
    profile: buildHistoryProfile(data, fields, bound),
  };
}

export function getFailedChecks(profile: HistoryProfile) {
  return profile.checks.filter((check) => check.status === "failed");
}
