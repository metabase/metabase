import * as Lib from "metabase-lib";
import type { OpaqueDatasetQuery, SegmentId } from "metabase-types/api";
import { isRecord } from "metabase-types/guards";

import type { ColumnRole } from "./columns";
import type { PaletteSegment } from "./segments/types";
import type { Grain } from "./spec/types";

/**
 * A set of actors picked by clicking a chart, e.g. everyone who reached a
 * funnel step. Prototype: membership is snapshotted as ids when the set is
 * picked, rather than re-derived from the source analysis on every run.
 */
export type CohortFilter = {
  /** The conditions that picked the set, e.g. "Reached step 2: Signed up". */
  label: string;
  grain: Grain;
  ids: string[];
};

/**
 * A segment of the people table, picked from the palette. Prototype: shown
 * as a pill and saved with the analysis, but not applied to the query yet.
 */
export type PeopleFilter = {
  /** The palette item it came from, so it can't be added twice. */
  key: string;
  label: string;
  segmentId: SegmentId | null;
};

/** Who an analysis counts, beyond the date range. */
export type AnalysisFilters = {
  /** A query on the event table; only its filters are used. */
  query: OpaqueDatasetQuery | null;
  cohorts: CohortFilter[];
  people: PeopleFilter[];
};

export const NO_FILTERS: AnalysisFilters = {
  query: null,
  cohorts: [],
  people: [],
};

export const COLUMN_ROLE_FOR_GRAIN: Record<Grain, ColumnRole> = {
  person: "person",
  session: "session",
  event: "event_id",
};

const GRAINS: readonly unknown[] = ["person", "session", "event"];

const isCohortFilter = (value: unknown): value is CohortFilter =>
  isRecord(value) &&
  typeof value.label === "string" &&
  GRAINS.includes(value.grain) &&
  Array.isArray(value.ids) &&
  value.ids.every((id) => typeof id === "string");

const isPeopleFilter = (value: unknown): value is PeopleFilter =>
  isRecord(value) &&
  typeof value.key === "string" &&
  typeof value.label === "string" &&
  (value.segmentId === null || typeof value.segmentId === "number");

export const isAnalysisFilters = (value: unknown): value is AnalysisFilters =>
  isRecord(value) &&
  (value.query === null || isRecord(value.query)) &&
  Array.isArray(value.cohorts) &&
  value.cohorts.every(isCohortFilter) &&
  Array.isArray(value.people) &&
  value.people.every(isPeopleFilter);

export const hasFilters = (filters: AnalysisFilters): boolean =>
  filters.query !== null ||
  filters.cohorts.length > 0 ||
  filters.people.length > 0;

/** Adds a people segment from the palette, once. */
export const withPeopleFilter = (
  filters: AnalysisFilters,
  segment: PaletteSegment,
): AnalysisFilters =>
  filters.people.some((people) => people.key === segment.key)
    ? filters
    : {
        ...filters,
        people: [
          ...filters.people,
          {
            key: segment.key,
            label: segment.name,
            segmentId: segment.status === "saved" ? segment.segment.id : null,
          },
        ],
      };

/** The filter query, or `null` when there is none or it can't be read. */
export const readFilterQuery = (
  metadataProvider: Lib.MetadataProvider,
  filters: AnalysisFilters,
): Lib.Query | null => {
  if (filters.query === null) {
    return null;
  }
  try {
    const query = Lib.fromJsQuery(metadataProvider, filters.query);
    return Lib.stageCount(query) > 0 ? query : null;
  } catch {
    return null;
  }
};

/** Stores a filter query, or clears it when it has no filters left. */
export const withFilterQuery = (
  filters: AnalysisFilters,
  query: Lib.Query,
): AnalysisFilters => ({
  ...filters,
  query: Lib.filters(query, -1).length > 0 ? Lib.toJsQuery(query) : null,
});

/** `column` is any of the cohort's ids. */
export const cohortFilterClause = (
  column: Lib.ColumnMetadata,
  cohort: CohortFilter,
): Lib.ExpressionClause =>
  Lib.expressionClause("=", [
    column,
    ...(Lib.isNumeric(column) ? cohort.ids.map(Number) : cohort.ids),
  ]);
