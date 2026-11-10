import { useMemo } from "react";
import { t } from "ttag";

import {
  type MetadataSelectorOpts,
  useMetadataProvider,
} from "metabase/metadata-store";
import {
  type DefaultSegment,
  type DefaultSegmentInference,
  type FieldCondition,
  type RequiredFilterInference,
  type ResolvedSegmentSettings,
  SYSTEM_SEGMENT_ROLES,
  type SystemSegmentInference,
  type SystemSegmentRole,
  getSystemSegmentDescription,
  getSystemSegmentLabel,
  inferDefaultSegment,
  inferRequiredFilter,
  inferSystemSegment,
  useSegmentSettings,
  useTableSegments,
} from "metabase/metadata/table-segments";
import { isRoleA, useTableStructures } from "metabase/metadata/table-structure";
import * as Lib from "metabase-lib";
import type { DatasetQuery, FieldId, Segment, Table } from "metabase-types/api";

const STAGE_INDEX = -1;

// Hoisted: the metadata selector memoises on the options object
const WITH_HIDDEN_TABLES: MetadataSelectorOpts = { includeHiddenTables: true };

export type SystemSegmentStatus =
  | "on"
  | "guessed"
  | "not-set-up"
  | "not-applicable";

export type ResolvedSystemSegment = {
  role: SystemSegmentRole;
  label: string;
  description: string;
  /** The base query with the segment's filters; `undefined` while loading */
  query: Lib.Query | undefined;
  filterNames: string[];
  isEdited: boolean;
  hasCustomFilter: boolean;
  condition: FieldCondition | undefined;
  status: SystemSegmentStatus;
  inference: SystemSegmentInference;
};

export function isUsableSystemSegment({ status }: ResolvedSystemSegment) {
  return status === "on" || status === "guessed";
}

export type ResolvedDefaultSegment = {
  segment: DefaultSegment;
  label: string;
  inference: DefaultSegmentInference;
  inferredLabel: string;
  isOverridden: boolean;
};

export type TableSegmentsModel = {
  /** The table's query with no filters; `undefined` while metadata loads */
  baseQuery: Lib.Query | undefined;
  systemSegments: ResolvedSystemSegment[];
  defaultSegment: ResolvedDefaultSegment;
  requiredFilter: ResolvedRequiredFilter;
  /** `undefined` goes back to the definition sync built */
  setSystemSegmentQuery: (role: SystemSegmentRole, query?: Lib.Query) => void;
  setSystemSegmentCondition: (
    role: SystemSegmentRole,
    condition?: FieldCondition,
  ) => void;
  setSystemSegmentApplicable: (
    role: SystemSegmentRole,
    isApplicable: boolean,
  ) => void;
  confirmSystemSegment: (role: SystemSegmentRole) => void;
  setDefaultSegment: (segment: DefaultSegment) => void;
  /** `null` sets no required filter */
  setRequiredFilterQuery: (query: Lib.Query | null) => void;
  setRequiredSystemSegment: (role: SystemSegmentRole) => void;
};

export type ResolvedRequiredFilter = {
  /** The base query with the one filter, or `null` for none */
  query: Lib.Query | null | undefined;
  filterName: string | null;
  inference: RequiredFilterInference;
  inferredQuery: Lib.Query | null | undefined;
  inferredFilterName: string | null;
  isOverridden: boolean;
  systemSegmentRole: SystemSegmentRole | undefined;
};

function findColumn(
  query: Lib.Query,
  fieldId: FieldId,
): Lib.ColumnMetadata | undefined {
  return Lib.filterableColumns(query, STAGE_INDEX).find((column) => {
    const { isImplicitlyJoinable } = Lib.displayInfo(
      query,
      STAGE_INDEX,
      column,
    );
    return (
      !isImplicitlyJoinable &&
      Lib.fieldValuesSearchInfo(query, column).fieldId === fieldId
    );
  });
}

function toFilterClause(
  query: Lib.Query,
  condition: FieldCondition,
): Lib.ExpressionClause | undefined {
  const column = findColumn(query, condition.fieldId);
  if (!column) {
    return undefined;
  }
  switch (condition.operator) {
    case "=":
      return typeof condition.value === "boolean"
        ? Lib.booleanFilterClause({
            operator: "=",
            column,
            values: [condition.value],
          })
        : Lib.stringFilterClause({
            operator: "=",
            column,
            values: [condition.value],
            options: {},
          });
    case "in":
      // A status bucket: text values usually, numbers for coded statuses
      return Lib.isNumeric(column)
        ? Lib.numberFilterClause({
            operator: "=",
            column,
            values: condition.values.map(Number),
          })
        : Lib.stringFilterClause({
            operator: "=",
            column,
            values: condition.values,
            options: {},
          });
    case "is-null":
    case "not-null":
      return Lib.defaultFilterClause({ operator: condition.operator, column });
    case "<":
    case ">":
      return Lib.numberFilterClause({
        operator: condition.operator,
        column,
        values: [condition.value],
      });
    case "between":
      return Lib.numberFilterClause({
        operator: "between",
        column,
        values: [condition.min, condition.max],
      });
    case "last-days":
      return Lib.relativeDateFilterClause({
        column,
        value: -condition.days,
        unit: "day",
        offsetValue: null,
        offsetUnit: null,
        options: {},
      });
  }
}

/** The query with a filter for each condition whose column it can find */
export function applyConditions(
  query: Lib.Query,
  conditions: FieldCondition[],
): Lib.Query {
  return conditions.reduce((nextQuery, condition) => {
    const clause = toFilterClause(nextQuery, condition);
    return clause ? Lib.filter(nextQuery, STAGE_INDEX, clause) : nextQuery;
  }, query);
}

export function getFilterNames(query: Lib.Query): string[] {
  return Lib.filters(query, STAGE_INDEX).map(
    (filter) => Lib.displayInfo(query, STAGE_INDEX, filter).displayName,
  );
}

/** A query on the table with no filters, to build segments and filters on */
export function useTableQuery(table: Table) {
  const metadataProvider = useMetadataProvider(table.db_id, WITH_HIDDEN_TABLES);
  const query = useMemo(() => {
    const tableMetadata = Lib.tableOrCardMetadata(metadataProvider, table.id);
    return tableMetadata
      ? Lib.queryFromTableOrCardMetadata(metadataProvider, tableMetadata)
      : undefined;
  }, [metadataProvider, table.id]);

  const fromDefinition = (definition: DatasetQuery) =>
    Lib.fromJsQuery(metadataProvider, definition);

  return { query, fromDefinition };
}

function getDefaultSegmentLabel(
  segment: DefaultSegment,
  customSegments: Segment[],
): string {
  switch (segment.type) {
    case "all":
      return t`All records`;
    case "system":
      return getSystemSegmentLabel(segment.role);
    case "custom":
      return (
        customSegments.find(({ id }) => id === segment.segmentId)?.name ??
        t`A deleted segment`
      );
  }
}

/** Why sync generated nothing, when an admin turned generation off */
export function getGenerationOffSignal({
  generateSegments,
}: ResolvedSegmentSettings): string | null {
  if (generateSegments.value) {
    return null;
  }
  return generateSegments.source === "schema"
    ? t`Segment generation is off for this schema`
    : t`Segment generation is off for this database`;
}

/**
 * PROTOTYPE: mocked. A table's system segments, default segment, and required
 * filter: what an admin set, over what sync would infer from its columns.
 */
export function useTableSegmentsModel(table: Table): TableSegmentsModel {
  const {
    getTableSegmentsOverrides,
    setSystemSegmentDefinition,
    setSystemSegmentCondition,
    setSystemSegmentApplicable,
    setDefaultSegment,
    setRequiredFilter,
    setRequiredSystemSegment,
  } = useTableSegments();
  const { getTableStructure } = useTableStructures();
  const { query: baseQuery, fromDefinition } = useTableQuery(table);
  const fields = table.fields ?? [];
  const customSegments = table.segments ?? [];
  const overrides = getTableSegmentsOverrides(table);
  const { mainDateField, role: tableRole, history } = getTableStructure(table);
  const currentVersion =
    tableRole != null && isRoleA(tableRole, "role/HistoryDimension")
      ? history
      : undefined;
  const { getSegmentSettings } = useSegmentSettings();
  const settings = getSegmentSettings(table.db_id, table.schema);
  const generationOffSignal = getGenerationOffSignal(settings);

  const systemSegments: ResolvedSystemSegment[] = SYSTEM_SEGMENT_ROLES.map(
    (role) => {
      const inference: SystemSegmentInference =
        generationOffSignal == null
          ? inferSystemSegment(fields, role, currentVersion)
          : { conditions: [], signal: generationOffSignal, confidence: "high" };
      const definition = overrides.systemSegments[role];
      const conditionOverride = overrides.systemSegmentConditions[role];
      const conditions = conditionOverride
        ? [conditionOverride]
        : inference.conditions;
      const query = definition
        ? fromDefinition(definition)
        : baseQuery && applyConditions(baseQuery, conditions);
      const filterNames = query ? getFilterNames(query) : [];
      const isEdited = definition != null || conditionOverride != null;
      const status: SystemSegmentStatus =
        overrides.notApplicableSystemSegments.includes(role)
          ? "not-applicable"
          : filterNames.length === 0
            ? "not-set-up"
            : isEdited
              ? "on"
              : "guessed";
      return {
        role,
        label: getSystemSegmentLabel(role),
        description: getSystemSegmentDescription(role),
        query,
        filterNames,
        isEdited,
        hasCustomFilter: definition != null,
        condition:
          definition == null && conditions.length === 1
            ? conditions[0]
            : undefined,
        status,
        inference,
      };
    },
  );

  const syncDefaultInference: DefaultSegmentInference =
    generationOffSignal == null
      ? inferDefaultSegment(fields, currentVersion)
      : {
          segment: { type: "all" },
          signal: generationOffSignal,
          confidence: "high",
        };
  // A default pointing at a deleted segment, or at a system segment that
  // filters nothing, falls back to the inferred one
  const savedDefault = overrides.defaultSegment;
  const isSavedDefaultUsable =
    savedDefault == null ||
    savedDefault.type === "all" ||
    (savedDefault.type === "custom"
      ? customSegments.some(({ id }) => id === savedDefault.segmentId)
      : systemSegments.some(
          (segment) =>
            segment.role === savedDefault.role &&
            isUsableSystemSegment(segment),
        ));
  const defaultOverride = isSavedDefaultUsable ? savedDefault : undefined;
  const inferredDefaultSegment = syncDefaultInference.segment;
  const isInferredDefaultUsable =
    inferredDefaultSegment.type !== "system" ||
    systemSegments.some(
      (segment) =>
        segment.role === inferredDefaultSegment.role &&
        isUsableSystemSegment(segment),
    );
  const defaultInference: DefaultSegmentInference = isInferredDefaultUsable
    ? syncDefaultInference
    : { ...syncDefaultInference, segment: { type: "all" } };
  const defaultSegmentValue = defaultOverride ?? defaultInference.segment;
  const defaultSegment: ResolvedDefaultSegment = {
    segment: defaultSegmentValue,
    label: getDefaultSegmentLabel(defaultSegmentValue, customSegments),
    inference: defaultInference,
    inferredLabel: getDefaultSegmentLabel(
      defaultInference.segment,
      customSegments,
    ),
    isOverridden: defaultOverride != null,
  };

  const requiredInference = inferRequiredFilter(
    table,
    mainDateField,
    settings.requiredFilterRowThreshold.value,
  );
  const inferredRequiredQuery =
    requiredInference.condition == null
      ? null
      : baseQuery && applyConditions(baseQuery, [requiredInference.condition]);
  const requiredSystemSegment = systemSegments.find(
    (segment) =>
      segment.role === overrides.requiredSystemSegment &&
      isUsableSystemSegment(segment),
  );
  const requiredQuery = requiredSystemSegment
    ? requiredSystemSegment.query
    : overrides.requiredFilter === undefined
      ? inferredRequiredQuery
      : overrides.requiredFilter === null
        ? null
        : fromDefinition(overrides.requiredFilter);
  const requiredFilter: ResolvedRequiredFilter = {
    query: requiredQuery,
    filterName: requiredSystemSegment
      ? requiredSystemSegment.label
      : requiredQuery
        ? (getFilterNames(requiredQuery)[0] ?? null)
        : null,
    inference: requiredInference,
    inferredQuery: inferredRequiredQuery,
    inferredFilterName: inferredRequiredQuery
      ? (getFilterNames(inferredRequiredQuery)[0] ?? null)
      : null,
    isOverridden:
      overrides.requiredFilter !== undefined || requiredSystemSegment != null,
    systemSegmentRole: requiredSystemSegment?.role,
  };

  return {
    baseQuery,
    systemSegments,
    defaultSegment,
    requiredFilter,
    setSystemSegmentQuery: (role: SystemSegmentRole, query?: Lib.Query) =>
      setSystemSegmentDefinition(
        table,
        role,
        query ? Lib.toJsQuery(query) : undefined,
      ),
    setSystemSegmentCondition: (
      role: SystemSegmentRole,
      condition?: FieldCondition,
    ) => setSystemSegmentCondition(table, role, condition),
    setSystemSegmentApplicable: (
      role: SystemSegmentRole,
      isApplicable: boolean,
    ) => setSystemSegmentApplicable(table, role, isApplicable),
    confirmSystemSegment: (role: SystemSegmentRole) => {
      const segment = systemSegments.find(
        (systemSegment) => systemSegment.role === role,
      );
      if (segment?.condition != null) {
        setSystemSegmentCondition(table, role, segment.condition);
      } else if (segment?.query != null) {
        setSystemSegmentDefinition(table, role, Lib.toJsQuery(segment.query));
      }
    },
    setDefaultSegment: (segment: DefaultSegment) =>
      setDefaultSegment(table, segment),
    /** `null` sets no required filter */
    setRequiredFilterQuery: (query: Lib.Query | null) =>
      setRequiredFilter(table, query ? Lib.toJsQuery(query) : null),
    setRequiredSystemSegment: (role: SystemSegmentRole) =>
      setRequiredSystemSegment(table, role),
  };
}
