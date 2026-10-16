import type { Field } from "metabase-types/api";

import type { ExtraColumn } from "../columns";
import { isCandidateField } from "../insights/candidates";

import type { AnalysisContext } from "./types";

/** A column people are split by, on the event table or the users table. */
export type BreakdownColumn = Pick<ExtraColumn, "column" | "from">;

export const MAX_BREAKDOWN_COLUMNS = 2;

/** The query's column holding each combination of breakdown values. */
export const BREAKDOWN_SEGMENT_COLUMN = "segment";

const BREAKDOWN_SOURCES: readonly BreakdownColumn["from"][] = [
  "events",
  "users",
];

const getSourceFields = (
  context: AnalysisContext,
  from: BreakdownColumn["from"],
): Field[] =>
  (from === "events"
    ? context.table?.fields
    : context.usersTable?.table.fields) ?? [];

const findBreakdownField = (
  context: AnalysisContext,
  { column, from }: BreakdownColumn,
): Field | undefined =>
  getSourceFields(context, from).find((field) => field.name === column);

const isBreakdownColumn = (value: unknown): value is BreakdownColumn =>
  typeof value === "object" &&
  value !== null &&
  "column" in value &&
  "from" in value &&
  typeof value.column === "string" &&
  BREAKDOWN_SOURCES.some((from) => from === value.from);

export const getBreakdownOptionValue = ({
  column,
  from,
}: BreakdownColumn): string => JSON.stringify([from, column]);

/** Breakdown columns the loaded tables have, without repeats. */
export const isBreakdownColumnList = (
  value: unknown,
  context: AnalysisContext,
): value is BreakdownColumn[] =>
  Array.isArray(value) &&
  value.length <= MAX_BREAKDOWN_COLUMNS &&
  value.every(
    (item) =>
      isBreakdownColumn(item) &&
      findBreakdownField(context, item) !== undefined,
  ) &&
  new Set(value.map(getBreakdownOptionValue)).size === value.length;

/** The name the planners read the breakdown column at `index` under. */
export const getBreakdownAttribute = (index: number): string =>
  `breakdown_${index + 1}`;

export const getBreakdownExtraColumns = (
  columns: readonly BreakdownColumn[],
): ExtraColumn[] =>
  columns.map(({ column, from }, index) => ({
    as: getBreakdownAttribute(index),
    column,
    from,
  }));

/** The breakdown columns' display names, joined like the segment values are. */
export const getBreakdownLabel = (
  columns: readonly BreakdownColumn[],
  context: AnalysisContext,
): string =>
  columns
    .map(
      (breakdown) =>
        findBreakdownField(context, breakdown)?.display_name ??
        breakdown.column,
    )
    .join(" · ");

export type BreakdownOption = {
  value: string;
  label: string;
  breakdown: BreakdownColumn;
};

/** The columns people can be split by, event table first. */
export const getBreakdownOptions = (
  context: AnalysisContext,
): BreakdownOption[] =>
  BREAKDOWN_SOURCES.flatMap((from) =>
    getSourceFields(context, from)
      .filter(isCandidateField)
      .filter(
        (field) =>
          from === "events" ||
          field.name !== context.usersTable?.link.primaryKey,
      )
      .map((field) => {
        const breakdown = { column: field.name, from };
        return {
          value: getBreakdownOptionValue(breakdown),
          label: field.display_name,
          breakdown,
        };
      }),
  );
