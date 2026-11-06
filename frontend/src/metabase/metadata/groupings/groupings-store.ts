import { useCallback, useMemo } from "react";
import _ from "underscore";

import { resolveStatusField, useLifecycle } from "metabase/metadata/lifecycle";
import { usePrototypeStorage } from "metabase/metadata/prototype-storage";
import { useSegmentGroups } from "metabase/metadata/segment-groups";
import { isRoleA, useTableStructures } from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { isDate, isPK } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId, Table } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import {
  type GroupingInferenceContext,
  getBuiltInGroupings,
  inferDefaultGrouping,
  inferGroupings,
} from "./inference";
import {
  type BinsDefinition,
  type DefaultGroupingInference,
  ELAPSED_UNITS,
  type Grouping,
  type PartitionDefinition,
  type PartitionValueGroup,
  type RelatedDefinition,
  TIME_EXTRACTS,
  TIME_UNITS,
  type TimeDefinition,
} from "./types";

/** An admin's grouping; an edit of sync's remembers which, to keep its place */
export type SavedGrouping = Grouping & { replacesSyncName?: string };

/** What an admin set on a column's groupings; absent means sync's */
export type FieldGroupingOverrides = {
  /** Admin-made groupings, and admin edits of sync's */
  groupings: SavedGrouping[];
  /** Sync groupings an admin removed */
  removedSyncNames: string[];
  /** Sync groupings an admin confirmed as they are */
  confirmedSyncNames: string[];
  defaultName?: string;
};

type GroupingsState = Record<string, FieldGroupingOverrides>;

// PROTOTYPE: mocked. There's no grouping (cut) table yet, so admin choices
// live in localStorage.
const STORAGE_KEY = "metabase-prototype-groupings";

const EMPTY_FIELD: FieldGroupingOverrides = {
  groupings: [],
  removedSyncNames: [],
  confirmedSyncNames: [],
};

const parseStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const parseNumbers = (value: unknown): number[] =>
  Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number")
    : [];

function parseTimeDefinition(value: unknown): TimeDefinition | null {
  if (!isObject(value)) {
    return null;
  }
  if (value.type === "unit") {
    const unit = TIME_UNITS.find((known) => known === value.unit);
    return unit ? { type: "unit", unit } : null;
  }
  if (value.type === "extract") {
    const extract = TIME_EXTRACTS.find((known) => known === value.extract);
    return extract ? { type: "extract", extract } : null;
  }
  if (value.type === "elapsed") {
    const unit = ELAPSED_UNITS.find((known) => known === value.unit);
    const to =
      value.to === "now" || typeof value.to === "number" ? value.to : null;
    return unit && to != null ? { type: "elapsed", to, unit } : null;
  }
  return null;
}

function parseBinsDefinition(value: unknown): BinsDefinition | null {
  if (!isObject(value)) {
    return null;
  }
  if (value.type === "auto") {
    return { type: "auto" };
  }
  if (
    (value.type === "count" || value.type === "quantile") &&
    typeof value.count === "number"
  ) {
    return { type: value.type, count: value.count };
  }
  if (value.type === "edges") {
    return {
      type: "edges",
      edges: parseNumbers(value.edges),
      labels: parseStrings(value.labels),
    };
  }
  return null;
}

function parseValueGroup(value: unknown): PartitionValueGroup[] {
  if (!isObject(value) || typeof value.label !== "string") {
    return [];
  }
  return [{ label: value.label, values: parseStrings(value.values) }];
}

function parsePartitionDefinition(value: unknown): PartitionDefinition | null {
  if (!isObject(value)) {
    return null;
  }
  if (
    value.type === "process" &&
    (value.level === "order" || value.level === "buckets")
  ) {
    return { type: "process", level: value.level };
  }
  if (
    value.type === "segment-group" &&
    typeof value.segmentGroupId === "string"
  ) {
    return { type: "segment-group", segmentGroupId: value.segmentGroupId };
  }
  if (value.type === "value-map") {
    return {
      type: "value-map",
      groups: Array.isArray(value.groups)
        ? value.groups.flatMap(parseValueGroup)
        : [],
      other: value.other === true,
    };
  }
  return null;
}

function parseRelatedDefinition(value: unknown): RelatedDefinition | null {
  if (!isObject(value) || typeof value.targetFieldId !== "number") {
    return null;
  }
  return {
    targetFieldId: value.targetFieldId,
    groupingName:
      typeof value.groupingName === "string" ? value.groupingName : null,
  };
}

function parseGrouping(value: unknown): SavedGrouping[] {
  if (!isObject(value) || typeof value.name !== "string") {
    return [];
  }
  const name = value.name;
  const replacesSyncName =
    typeof value.replacesSyncName === "string"
      ? value.replacesSyncName
      : undefined;
  const base = { name, replacesSyncName };
  if (value.kind === "time") {
    const definition = parseTimeDefinition(value.definition);
    return definition
      ? [{ ...base, source: "admin", kind: "time", definition }]
      : [];
  }
  if (value.kind === "bins") {
    const definition = parseBinsDefinition(value.definition);
    return definition
      ? [{ ...base, source: "admin", kind: "bins", definition }]
      : [];
  }
  if (value.kind === "partition") {
    const definition = parsePartitionDefinition(value.definition);
    return definition
      ? [{ ...base, source: "admin", kind: "partition", definition }]
      : [];
  }
  if (value.kind === "related") {
    const definition = parseRelatedDefinition(value.definition);
    return definition
      ? [{ ...base, source: "admin", kind: "related", definition }]
      : [];
  }
  return [];
}

function parseFieldOverrides(value: unknown): FieldGroupingOverrides {
  if (!isObject(value)) {
    return EMPTY_FIELD;
  }
  return {
    groupings: Array.isArray(value.groupings)
      ? value.groupings.flatMap(parseGrouping)
      : [],
    removedSyncNames: parseStrings(value.removedSyncNames),
    confirmedSyncNames: parseStrings(value.confirmedSyncNames),
    defaultName:
      typeof value.defaultName === "string" ? value.defaultName : undefined,
  };
}

function parseState(value: unknown): GroupingsState {
  return isObject(value) ? _.mapObject(value, parseFieldOverrides) : {};
}

/** Columns' groupings and defaults as an admin set them */
export function useGroupings() {
  const [state, updateState] = usePrototypeStorage(STORAGE_KEY, parseState);

  const getFieldGroupings = useCallback(
    (fieldId: FieldId): FieldGroupingOverrides =>
      state[String(fieldId)] ?? EMPTY_FIELD,
    [state],
  );

  const updateField = useCallback(
    (
      fieldId: FieldId,
      update: (current: FieldGroupingOverrides) => FieldGroupingOverrides,
    ) =>
      updateState((current) => ({
        ...current,
        [String(fieldId)]: update(current[String(fieldId)] ?? EMPTY_FIELD),
      })),
    [updateState],
  );

  /**
   * Saves an admin's grouping in place of the one named `originalName`: an
   * admin's, or sync's, which it then replaces where it stood. The default
   * follows a rename.
   */
  const saveGrouping = useCallback(
    (fieldId: FieldId, grouping: Grouping, originalName?: string) =>
      updateField(fieldId, (current) => {
        const existing =
          originalName != null
            ? current.groupings.find(({ name }) => name === originalName)
            : undefined;
        const saved: SavedGrouping = {
          ...grouping,
          source: "admin",
          // No admin grouping had that name, so it was sync's
          replacesSyncName: existing ? existing.replacesSyncName : originalName,
        };
        const isRenamed = originalName != null && originalName !== saved.name;
        return {
          ...current,
          groupings: existing
            ? current.groupings.map((known) =>
                known === existing ? saved : known,
              )
            : [...current.groupings, saved],
          defaultName:
            isRenamed && current.defaultName === originalName
              ? saved.name
              : current.defaultName,
        };
      }),
    [updateField],
  );

  /** Removes an admin's grouping, or hides sync's */
  const removeGrouping = useCallback(
    (fieldId: FieldId, name: string) =>
      updateField(fieldId, (current) => {
        const replaced = current.groupings.find(
          (known) => known.name === name,
        )?.replacesSyncName;
        return {
          ...current,
          groupings: current.groupings.filter((known) => known.name !== name),
          // Removing an edit of sync's removes sync's too
          removedSyncNames: _.uniq(
            replaced != null
              ? [...current.removedSyncNames, name, replaced]
              : [...current.removedSyncNames, name],
          ),
          defaultName:
            current.defaultName === name ? undefined : current.defaultName,
        };
      }),
    [updateField],
  );

  const confirmGrouping = useCallback(
    (fieldId: FieldId, name: string) =>
      updateField(fieldId, (current) => ({
        ...current,
        confirmedSyncNames: _.uniq([...current.confirmedSyncNames, name]),
      })),
    [updateField],
  );

  const setDefaultGrouping = useCallback(
    (fieldId: FieldId, defaultName: string) =>
      updateField(fieldId, (current) => ({ ...current, defaultName })),
    [updateField],
  );

  return {
    getFieldGroupings,
    saveGrouping,
    removeGrouping,
    confirmGrouping,
    setDefaultGrouping,
  };
}

/** A grouping as the drawer lists it */
export type ResolvedGrouping = Grouping & {
  /** Sync made it and no admin confirmed or edited it */
  isInferred: boolean;
};

/** A column's groupings: built-ins, sync's and an admin's, and its default */
export type ResolvedGroupings = {
  builtIns: Grouping[];
  /** Sync's (minus removed ones, with an admin's edits in their place), then an admin's */
  groupings: ResolvedGrouping[];
  /** `undefined` when the column has no default */
  defaultName: string | undefined;
  defaultInference: DefaultGroupingInference | null;
  /** The default is sync's guess, not an admin's choice */
  isDefaultInferred: boolean;
  context: GroupingInferenceContext;
};

/** Built-ins, sync's proposals, and an admin's choices, merged for a column */
export function useResolvedGroupings(
  field: Field,
  table: Table,
): ResolvedGroupings {
  const fieldId = getRawTableFieldId(field);
  const { getFieldGroupings } = useGroupings();
  const { getTableProcess } = useLifecycle();
  const { getSegmentGroups } = useSegmentGroups();
  const { getTableStructure } = useTableStructures();
  const overrides = getFieldGroupings(fieldId);
  const fields = useMemo(() => table.fields ?? [], [table.fields]);
  const statusFieldId = getTableProcess(table).statusFieldId;
  const segmentGroups = getSegmentGroups(table);
  const structure = getTableStructure(table);

  const isPeriodKey =
    structure.role != null &&
    isRoleA(structure.role, "role/PeriodicSnapshotFact") &&
    isDate(field) &&
    (isPK(field) ||
      structure.grainFields.some(
        (grainField) => getRawTableFieldId(grainField) === fieldId,
      ));
  const periodGranularity = isPeriodKey
    ? structure.periodGranularity
    : undefined;

  return useMemo(() => {
    const context: GroupingInferenceContext = {
      fields,
      statusField: resolveStatusField(fields, statusFieldId),
      segmentGroups,
      periodGranularity,
    };
    const builtIns = getBuiltInGroupings(field);
    // Each admin grouping stands in for the sync one it edits, or shares a name with
    const replacements = new Map(
      overrides.groupings.map((saved) => [
        saved.replacesSyncName ?? saved.name,
        saved,
      ]),
    );
    const placed = new Set<SavedGrouping>();
    const syncGroupings = inferGroupings(field, context).flatMap(
      (grouping): ResolvedGrouping[] => {
        const replacement = replacements.get(grouping.name);
        if (replacement) {
          placed.add(replacement);
          return [{ ...replacement, isInferred: false }];
        }
        if (overrides.removedSyncNames.includes(grouping.name)) {
          return [];
        }
        return [
          {
            ...grouping,
            isInferred: !overrides.confirmedSyncNames.includes(grouping.name),
          },
        ];
      },
    );
    const groupings: ResolvedGrouping[] = [
      ...syncGroupings,
      ...overrides.groupings
        .filter((saved) => !placed.has(saved))
        .map((saved): ResolvedGrouping => ({ ...saved, isInferred: false })),
    ];
    const allNames = new Set(
      [...groupings, ...builtIns].map(({ name }) => name),
    );
    const defaultInference = inferDefaultGrouping(
      field,
      [...groupings, ...builtIns],
      context,
    );
    const savedDefault =
      overrides.defaultName != null && allNames.has(overrides.defaultName)
        ? overrides.defaultName
        : undefined;
    const inferredDefault =
      defaultInference != null && allNames.has(defaultInference.name)
        ? defaultInference.name
        : undefined;
    return {
      builtIns,
      groupings,
      defaultName: savedDefault ?? inferredDefault,
      defaultInference,
      isDefaultInferred: savedDefault == null && inferredDefault != null,
      context,
    };
  }, [
    field,
    fields,
    statusFieldId,
    segmentGroups,
    periodGranularity,
    overrides,
  ]);
}
