import { useCallback } from "react";
import _ from "underscore";

import { usePrototypeStorage } from "metabase/metadata/prototype-storage";
import type { DatasetQuery, Table } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import {
  type DefaultSegment,
  type FieldCondition,
  SYSTEM_SEGMENT_ROLES,
  type SystemSegmentRole,
} from "./inference";

/** What an admin set; anything absent comes from sync's inference */
export type TableSegmentsOverrides = {
  /** System segments an admin wrote a custom filter for */
  systemSegments: Partial<Record<SystemSegmentRole, DatasetQuery>>;
  /** System segments an admin pointed at the column that marks their rows */
  systemSegmentConditions: Partial<Record<SystemSegmentRole, FieldCondition>>;
  /** System segments an admin said don't apply to the table */
  notApplicableSystemSegments: SystemSegmentRole[];
  defaultSegment?: DefaultSegment;
  /** `null` means an admin said the table has no required filter */
  requiredFilter?: DatasetQuery | null;
  /** A system segment an admin made the required filter */
  requiredSystemSegment?: SystemSegmentRole;
  /** Proposed cohorts already accepted or dismissed */
  resolvedCohortKeys: string[];
};

type TableSegmentsState = {
  tables: Record<string, TableSegmentsOverrides>;
};

// PROTOTYPE: mocked. There's no segment_role, default_scope_segment_id, or
// required_filter_field_id column yet, so admin choices live in localStorage.
const STORAGE_KEY = "metabase-prototype-table-segments";

const EMPTY_OVERRIDES: TableSegmentsOverrides = {
  systemSegments: {},
  systemSegmentConditions: {},
  notApplicableSystemSegments: [],
  resolvedCohortKeys: [],
};

function parseDatasetQuery(value: unknown): DatasetQuery | undefined {
  if (!isObject(value) || typeof value.database !== "number") {
    return undefined;
  }
  // Written by this store from `Lib.toJsQuery`, so anything shaped like a
  // query with a database is one of ours
  return value as DatasetQuery;
}

function parseSystemSegmentCondition(
  value: unknown,
): FieldCondition | undefined {
  if (!isObject(value) || typeof value.fieldId !== "number") {
    return undefined;
  }
  if (value.operator === "=" && typeof value.value === "boolean") {
    return { fieldId: value.fieldId, operator: "=", value: value.value };
  }
  if (value.operator === "is-null" || value.operator === "not-null") {
    return { fieldId: value.fieldId, operator: value.operator };
  }
  return undefined;
}

function parseSystemSegmentRole(value: unknown): SystemSegmentRole | undefined {
  return SYSTEM_SEGMENT_ROLES.find((role) => role === value);
}

function parseDefaultSegment(value: unknown): DefaultSegment | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  if (value.type === "all") {
    return { type: "all" };
  }
  if (value.type === "system") {
    const role = SYSTEM_SEGMENT_ROLES.find((role) => role === value.role);
    return role ? { type: "system", role } : undefined;
  }
  if (value.type === "custom" && typeof value.segmentId === "number") {
    return { type: "custom", segmentId: value.segmentId };
  }
  return undefined;
}

function parseOverrides(value: unknown): TableSegmentsOverrides {
  if (!isObject(value)) {
    return EMPTY_OVERRIDES;
  }
  const systemSegments = isObject(value.systemSegments)
    ? Object.fromEntries(
        SYSTEM_SEGMENT_ROLES.flatMap((role) => {
          const query =
            isObject(value.systemSegments) &&
            parseDatasetQuery(value.systemSegments[role]);
          return query ? [[role, query]] : [];
        }),
      )
    : {};
  const systemSegmentConditions = isObject(value.systemSegmentConditions)
    ? Object.fromEntries(
        SYSTEM_SEGMENT_ROLES.flatMap((role) => {
          const condition =
            isObject(value.systemSegmentConditions) &&
            parseSystemSegmentCondition(value.systemSegmentConditions[role]);
          return condition ? [[role, condition]] : [];
        }),
      )
    : {};
  const notApplicableSystemSegments = Array.isArray(
    value.notApplicableSystemSegments,
  )
    ? value.notApplicableSystemSegments.flatMap((role) => {
        const knownRole = parseSystemSegmentRole(role);
        return knownRole ? [knownRole] : [];
      })
    : [];
  return {
    systemSegments,
    systemSegmentConditions,
    notApplicableSystemSegments,
    defaultSegment: parseDefaultSegment(value.defaultSegment),
    requiredFilter:
      value.requiredFilter === null
        ? null
        : parseDatasetQuery(value.requiredFilter),
    requiredSystemSegment: parseSystemSegmentRole(value.requiredSystemSegment),
    resolvedCohortKeys: Array.isArray(value.resolvedCohortKeys)
      ? value.resolvedCohortKeys.filter(
          (key): key is string => typeof key === "string",
        )
      : [],
  };
}

function parseState(value: unknown): TableSegmentsState {
  if (!isObject(value) || !isObject(value.tables)) {
    return { tables: {} };
  }
  return { tables: _.mapObject(value.tables, parseOverrides) };
}

function getTableKey(table: Pick<Table, "db_id" | "id">) {
  return `${table.db_id}:${table.id}`;
}

/**
 * Every table's default segment, required filter, edited system segments,
 * and handled cohort proposals, as an admin set them.
 */
export function useTableSegments() {
  const [state, updateState] = usePrototypeStorage(STORAGE_KEY, parseState);

  const getTableSegmentsOverrides = useCallback(
    (table: Pick<Table, "db_id" | "id">): TableSegmentsOverrides =>
      state.tables[getTableKey(table)] ?? EMPTY_OVERRIDES,
    [state],
  );

  const updateOverrides = useCallback(
    (
      table: Pick<Table, "db_id" | "id">,
      update: (overrides: TableSegmentsOverrides) => TableSegmentsOverrides,
    ) => {
      const tableKey = getTableKey(table);
      updateState((current) => ({
        tables: {
          ...current.tables,
          [tableKey]: update(current.tables[tableKey] ?? EMPTY_OVERRIDES),
        },
      }));
    },
    [updateState],
  );

  /** `undefined` goes back to the definition sync built */
  const setSystemSegmentDefinition = useCallback(
    (
      table: Pick<Table, "db_id" | "id">,
      role: SystemSegmentRole,
      definition: DatasetQuery | undefined,
    ) =>
      updateOverrides(table, (overrides) => ({
        ...overrides,
        systemSegments:
          definition == null
            ? _.omit(overrides.systemSegments, role)
            : { ...overrides.systemSegments, [role]: definition },
        systemSegmentConditions:
          definition == null
            ? overrides.systemSegmentConditions
            : _.omit(overrides.systemSegmentConditions, role),
      })),
    [updateOverrides],
  );

  /** `undefined` goes back to the column sync found */
  const setSystemSegmentCondition = useCallback(
    (
      table: Pick<Table, "db_id" | "id">,
      role: SystemSegmentRole,
      condition: FieldCondition | undefined,
    ) =>
      updateOverrides(table, (overrides) => ({
        ...overrides,
        systemSegments: _.omit(overrides.systemSegments, role),
        systemSegmentConditions:
          condition == null
            ? _.omit(overrides.systemSegmentConditions, role)
            : { ...overrides.systemSegmentConditions, [role]: condition },
        notApplicableSystemSegments: _.without(
          overrides.notApplicableSystemSegments,
          role,
        ),
      })),
    [updateOverrides],
  );

  const setSystemSegmentApplicable = useCallback(
    (
      table: Pick<Table, "db_id" | "id">,
      role: SystemSegmentRole,
      isApplicable: boolean,
    ) =>
      updateOverrides(table, (overrides) => ({
        ...overrides,
        notApplicableSystemSegments: isApplicable
          ? _.without(overrides.notApplicableSystemSegments, role)
          : _.uniq([...overrides.notApplicableSystemSegments, role]),
      })),
    [updateOverrides],
  );

  /** `undefined` goes back to the inferred default segment */
  const setDefaultSegment = useCallback(
    (
      table: Pick<Table, "db_id" | "id">,
      defaultSegment: DefaultSegment | undefined,
    ) =>
      updateOverrides(table, (overrides) => ({ ...overrides, defaultSegment })),
    [updateOverrides],
  );

  /** `null` sets no required filter; `undefined` goes back to the inferred one */
  const setRequiredFilter = useCallback(
    (
      table: Pick<Table, "db_id" | "id">,
      requiredFilter: DatasetQuery | null | undefined,
    ) =>
      updateOverrides(table, (overrides) => ({
        ...overrides,
        requiredFilter,
        requiredSystemSegment: undefined,
      })),
    [updateOverrides],
  );

  const setRequiredSystemSegment = useCallback(
    (table: Pick<Table, "db_id" | "id">, role: SystemSegmentRole) =>
      updateOverrides(table, (overrides) => ({
        ...overrides,
        requiredFilter: undefined,
        requiredSystemSegment: role,
      })),
    [updateOverrides],
  );

  const resolveCohort = useCallback(
    (table: Pick<Table, "db_id" | "id">, cohortKey: string) =>
      updateOverrides(table, (overrides) => ({
        ...overrides,
        resolvedCohortKeys: _.uniq([
          ...overrides.resolvedCohortKeys,
          cohortKey,
        ]),
      })),
    [updateOverrides],
  );

  return {
    getTableSegmentsOverrides,
    setSystemSegmentDefinition,
    setSystemSegmentCondition,
    setSystemSegmentApplicable,
    setDefaultSegment,
    setRequiredFilter,
    setRequiredSystemSegment,
    resolveCohort,
  };
}
