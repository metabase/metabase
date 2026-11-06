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

export type ResolvedSystemSegment = {
  role: SystemSegmentRole;
  label: string;
  description: string;
  /** The base query with the segment's filters; `undefined` while loading */
  query: Lib.Query | undefined;
  filterNames: string[];
  isEdited: boolean;
  inference: SystemSegmentInference;
};

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
  setDefaultSegment: (segment: DefaultSegment) => void;
  /** `null` sets no required filter */
  setRequiredFilterQuery: (query: Lib.Query | null) => void;
};

export type ResolvedRequiredFilter = {
  /** The base query with the one filter, or `null` for none */
  query: Lib.Query | null | undefined;
  filterName: string | null;
  inference: RequiredFilterInference;
  inferredQuery: Lib.Query | null | undefined;
  inferredFilterName: string | null;
  isOverridden: boolean;
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
    setDefaultSegment,
    setRequiredFilter,
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
      const query = definition
        ? fromDefinition(definition)
        : baseQuery && applyConditions(baseQuery, inference.conditions);
      return {
        role,
        label: getSystemSegmentLabel(role),
        description: getSystemSegmentDescription(role),
        query,
        filterNames: query ? getFilterNames(query) : [],
        isEdited: definition != null,
        inference,
      };
    },
  );

  const defaultInference: DefaultSegmentInference =
    generationOffSignal == null
      ? inferDefaultSegment(fields, currentVersion)
      : {
          segment: { type: "all" },
          signal: generationOffSignal,
          confidence: "high",
        };
  // A default pointing at a deleted segment falls back to the inferred one
  const defaultOverride =
    overrides.defaultSegment?.type === "custom" &&
    !customSegments.some(
      ({ id }) =>
        overrides.defaultSegment?.type === "custom" &&
        id === overrides.defaultSegment.segmentId,
    )
      ? undefined
      : overrides.defaultSegment;
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
  const requiredQuery =
    overrides.requiredFilter === undefined
      ? inferredRequiredQuery
      : overrides.requiredFilter === null
        ? null
        : fromDefinition(overrides.requiredFilter);
  const requiredFilter: ResolvedRequiredFilter = {
    query: requiredQuery,
    filterName: requiredQuery
      ? (getFilterNames(requiredQuery)[0] ?? null)
      : null,
    inference: requiredInference,
    inferredQuery: inferredRequiredQuery,
    inferredFilterName: inferredRequiredQuery
      ? (getFilterNames(inferredRequiredQuery)[0] ?? null)
      : null,
    isOverridden: overrides.requiredFilter !== undefined,
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
    setDefaultSegment: (segment: DefaultSegment) =>
      setDefaultSegment(table, segment),
    /** `null` sets no required filter */
    setRequiredFilterQuery: (query: Lib.Query | null) =>
      setRequiredFilter(table, query ? Lib.toJsQuery(query) : null),
  };
}
