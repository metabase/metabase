import { match } from "ts-pattern";

import * as Lib from "metabase-lib";
import type {
  ConcreteTableId,
  MetabotEventAnalysisChange,
  MetabotEventAnalysisOperator,
  Table,
} from "metabase-types/api";

import type { CommonSettings, FunnelSettings } from "../analyses/types";
import { parseDateRange } from "../date-range";
import { readEventQuery } from "../events/read-event-query";
import type { EventDefinition } from "../events/types";
import { readFilterQuery, withFilterQuery } from "../filters";
import { findColumn } from "../find-column";
import { segmentToEventDefinition } from "../segments/to-event-definition";
import type { SavedPaletteSegment } from "../segments/types";

const STAGE_INDEX = -1;

/** The settings a suggestion can change, across every kind. */
export type SuggestedSettings = Partial<CommonSettings & FunnelSettings>;

export type SuggestionContext = {
  metadataProvider: Lib.MetadataProvider;
  tableId: ConcreteTableId;
  /** The users table, when the person column links to one. */
  usersTable: Table | undefined;
  /** The current settings, which the changes build on. */
  settings: SuggestedSettings;
  segments: readonly SavedPaletteSegment[];
};

export type SuggestionResult =
  | { status: "ok"; changes: SuggestedSettings }
  | { status: "error"; message: string };

class SuggestionError extends Error {}

const getTableQuery = ({ metadataProvider, tableId }: SuggestionContext) => {
  const metadata = Lib.tableOrCardMetadata(metadataProvider, tableId);
  if (metadata === null) {
    throw new SuggestionError("The event table's metadata isn't loaded.");
  }
  return Lib.queryFromTableOrCardMetadata(metadataProvider, metadata);
};

const toArg = (column: Lib.ColumnMetadata, value: string) => {
  if (Lib.isBoolean(column)) {
    return value === "true";
  }
  return Lib.isNumeric(column) ? Number(value) : value;
};

/** Adds `column <operator> values` to the query's filters. */
const addCondition = (
  query: Lib.Query,
  columnName: string,
  operator: MetabotEventAnalysisOperator,
  values: readonly string[] = [],
): Lib.Query => {
  let column: Lib.ColumnMetadata;
  try {
    column = findColumn(query, columnName);
  } catch {
    throw new SuggestionError(`There's no column named ${columnName}.`);
  }
  const clause = match(operator)
    .with("is-empty", "not-empty", (operator) =>
      Lib.expressionClause(operator, [column]),
    )
    .with("=", "!=", (operator) => {
      if (values.length === 0) {
        throw new SuggestionError(`${operator} needs at least one value.`);
      }
      return Lib.expressionClause(operator, [
        column,
        ...values.map((value) => toArg(column, value)),
      ]);
    })
    .exhaustive();
  return Lib.filter(query, STAGE_INDEX, clause);
};

const describeCondition = (
  column: string,
  operator: MetabotEventAnalysisOperator,
  values: readonly string[] = [],
) =>
  operator === "is-empty" || operator === "not-empty"
    ? `${column} ${operator}`
    : `${column} ${operator} ${values.join(", ")}`;

const withFilter = (
  context: SuggestionContext,
  settings: SuggestedSettings,
  change: Extract<MetabotEventAnalysisChange, { type: "filter" }>,
): SuggestedSettings => {
  const filters = settings.filters ?? {
    query: null,
    cohorts: [],
    people: [],
  };
  const query =
    readFilterQuery(context.metadataProvider, filters) ??
    getTableQuery(context);
  return {
    filters: withFilterQuery(
      filters,
      addCondition(query, change.column, change.operator, change.values),
    ),
  };
};

const withStepFilter = (
  context: SuggestionContext,
  settings: SuggestedSettings,
  change: Extract<MetabotEventAnalysisChange, { type: "step-filter" }>,
): SuggestedSettings => {
  const steps = settings["funnel.steps"] ?? [];
  const step = steps[change.step - 1];
  if (step === undefined) {
    throw new SuggestionError(`The funnel has no step ${change.step}.`);
  }
  const query = readEventQuery(context.metadataProvider, step);
  if (query === null) {
    throw new SuggestionError(`Step ${change.step} can't be read.`);
  }
  const next: EventDefinition = {
    name: `${step.name}, ${describeCondition(change.column, change.operator, change.values)}`,
    query: Lib.toJsQuery(
      addCondition(query, change.column, change.operator, change.values),
    ),
  };
  return {
    "funnel.steps": steps.map((current, index) =>
      index === change.step - 1 ? next : current,
    ),
  };
};

const withSteps = (
  context: SuggestionContext,
  segmentNames: readonly string[],
): SuggestedSettings => {
  const tableQuery = getTableQuery(context);
  const steps = segmentNames.map((name) => {
    const segment = context.segments.find(
      (segment) => segment.name.toLowerCase() === name.toLowerCase(),
    );
    const event =
      segment !== undefined
        ? segmentToEventDefinition(
            tableQuery,
            context.metadataProvider,
            segment,
          )
        : undefined;
    if (event === undefined) {
      throw new SuggestionError(`There's no saved segment named ${name}.`);
    }
    return event;
  });
  return { "funnel.steps": steps };
};

const withBreakout = (
  context: SuggestionContext,
  column: string | null,
): SuggestedSettings => {
  if (column === null) {
    return { breakout: null };
  }
  const fields = context.usersTable?.fields ?? [];
  if (
    context.usersTable !== undefined &&
    !fields.some((field) => field.name === column)
  ) {
    throw new SuggestionError(
      `Breakouts are by the users table's columns, and it has no ${column}.`,
    );
  }
  return { breakout: { type: "property", column } };
};

const applyChange = (
  context: SuggestionContext,
  settings: SuggestedSettings,
  change: MetabotEventAnalysisChange,
): SuggestedSettings =>
  match(change)
    .with({ type: "filter" }, (change) => withFilter(context, settings, change))
    .with({ type: "step-filter" }, (change) =>
      withStepFilter(context, settings, change),
    )
    .with({ type: "steps" }, ({ segments }) => withSteps(context, segments))
    .with({ type: "breakout" }, ({ column }) => withBreakout(context, column))
    .with({ type: "date_range" }, ({ value }): SuggestedSettings => {
      if (parseDateRange(value) === undefined) {
        throw new SuggestionError(`${value} isn't a date range.`);
      }
      return { date_range: value };
    })
    .with({ type: "counting" }, ({ value }) => ({ counting: value }))
    .with({ type: "funnel.window" }, ({ value }) => ({
      "funnel.window": value,
    }))
    .exhaustive();

/**
 * PROTOTYPE: a suggestion's changes as settings, each applied on top of the
 * ones before. An error names the first change that can't be made.
 */
export const getSuggestedSettings = (
  context: SuggestionContext,
  changes: readonly MetabotEventAnalysisChange[],
): SuggestionResult => {
  try {
    const result = changes.reduce<{
      settings: SuggestedSettings;
      changes: SuggestedSettings;
    }>(
      (current, change) => {
        const next = applyChange(context, current.settings, change);
        return {
          settings: { ...current.settings, ...next },
          changes: { ...current.changes, ...next },
        };
      },
      { settings: context.settings, changes: {} },
    );
    return { status: "ok", changes: result.changes };
  } catch (error) {
    if (error instanceof SuggestionError) {
      return { status: "error", message: error.message };
    }
    throw error;
  }
};
