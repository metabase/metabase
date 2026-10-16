import { t } from "ttag";

import { diagnoseAndCompile } from "metabase/querying/expressions";
import * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

export type ExploreSuggestionKind =
  | "search"
  | "filter"
  | "aggregation"
  | "breakout"
  | "summary"
  | "column"
  | "invalid";

export type ExploreSuggestion = {
  id: string;
  kind: ExploreSuggestionKind;
  label: string;
  hint?: string;
  icon: IconName;
  score: number;
  /** `null` for an item that only explains why the text can't be used. */
  apply: ((query: Lib.Query) => Lib.Query) | null;
};

/** Known values of a list-type column, used to turn "gadget" into "Category is Gadget". */
export type ColumnValueOptions = {
  column: Lib.ColumnMetadata;
  values: string[];
};

export type ExploreSuggestionContext = {
  query: Lib.Query;
  stageIndex: number;
  columnValues?: ColumnValueOptions[];
};

const MAX_SUGGESTIONS = 8;
const MIN_MATCH_LENGTH = 2;

const AGGREGATION_WORDS: Record<string, string> = {
  count: "count",
  "number of": "count",
  "how many": "count",
  sum: "sum",
  total: "sum",
  avg: "avg",
  average: "avg",
  mean: "avg",
  median: "median",
  min: "min",
  minimum: "min",
  lowest: "min",
  max: "max",
  maximum: "max",
  highest: "max",
  distinct: "distinct",
  unique: "distinct",
};

const AGGREGATION_PATTERN = new RegExp(
  `^(${Object.keys(AGGREGATION_WORDS).join("|")})(?:\\s+(?:of\\s+)?(.*))?$`,
);

const TEMPORAL_UNITS = [
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
] as const;
type TemporalUnitWord = (typeof TEMPORAL_UNITS)[number];

const RELATIVE_DATE_PATTERN =
  /^(?:in the\s+)?(last|past|previous|next)\s+(\d+)?\s*(minute|hour|day|week|month|quarter|year)s?$/;
const CURRENT_DATE_PATTERN =
  /^(?:this|current)\s+(day|week|month|quarter|year)$/;

const COMPARISON_PATTERN =
  /^(.+?)\s*(>=|<=|!=|<>|>|<|=|\bis not\b|\bisn't\b|\bis\b|\bequals\b|\bover\b|\bunder\b|\babove\b|\bbelow\b|\bmore than\b|\bless than\b|\bat least\b|\bat most\b|\bcontains\b)\s*(.+)$/;

type ComparisonWord = "=" | "!=" | ">" | "<" | ">=" | "<=" | "contains";

const COMPARISON_WORDS: Record<string, ComparisonWord> = {
  "=": "=",
  is: "=",
  equals: "=",
  "!=": "!=",
  "<>": "!=",
  "is not": "!=",
  "isn't": "!=",
  ">": ">",
  over: ">",
  above: ">",
  "more than": ">",
  "<": "<",
  under: "<",
  below: "<",
  "less than": "<",
  ">=": ">=",
  "at least": ">=",
  "<=": "<=",
  "at most": "<=",
  contains: "contains",
};

/**
 * What a piece of text typed into the explore bar could mean, best first: a search, a filter
 * ("gadget", "price over 50", "last 30 days"), a calculation ("sum of total"), a grouping
 * ("by state"), a whole summary ("count by month"), or a custom expression ("= [Price] * 2").
 * An empty text gives starter suggestions.
 */
export function getExploreSuggestions(
  context: ExploreSuggestionContext,
  text: string,
): ExploreSuggestion[] {
  const trimmedText = text.trim();
  if (trimmedText.length === 0) {
    return getStarterSuggestions(context);
  }

  const isExpression = trimmedText.startsWith("=") || /[[(]/.test(trimmedText);
  if (isExpression) {
    return getExpressionSuggestions(context, trimmedText.replace(/^=\s*/, ""));
  }

  const needle = trimmedText.toLowerCase();
  const suggestions = [
    ...getSummarySuggestions(context, needle),
    ...getAggregationPhraseSuggestions(context, needle),
    ...getDateFilterSuggestions(context, needle),
    ...getComparisonSuggestions(context, needle),
    ...getValueSuggestions(context, needle),
    ...getColumnSuggestions(context, needle),
    ...getMetricSuggestions(context, needle),
    ...getSearchSuggestions(context, trimmedText),
  ];
  return rankSuggestions(suggestions);
}

function rankSuggestions(
  suggestions: ExploreSuggestion[],
): ExploreSuggestion[] {
  const seenLabels = new Set<string>();
  return [...suggestions]
    .sort((a, b) => b.score - a.score)
    .filter((suggestion) => {
      if (seenLabels.has(suggestion.label)) {
        return false;
      }
      seenLabels.add(suggestion.label);
      return true;
    })
    .slice(0, MAX_SUGGESTIONS);
}

/* ---------------------------------------------------------------------------------------------
 * Matching
 * ------------------------------------------------------------------------------------------- */

/** How well `name` matches what was typed, 0 meaning not at all. */
export function getMatchScore(name: string, needle: string): number {
  const normalizedName = name.toLowerCase();
  const normalizedNeedle = needle.trim().toLowerCase();
  if (normalizedNeedle.length < MIN_MATCH_LENGTH) {
    return 0;
  }
  if (normalizedName === normalizedNeedle) {
    return 100;
  }
  if (normalizedName.startsWith(normalizedNeedle)) {
    return 80;
  }
  if (
    normalizedName
      .split(/[\s_→:-]+/)
      .some((word) => word.startsWith(normalizedNeedle))
  ) {
    return 70;
  }
  if (normalizedName.includes(normalizedNeedle)) {
    return 50;
  }
  return 0;
}

type ColumnMatch = {
  column: Lib.ColumnMetadata;
  score: number;
};

function getColumnLabel(
  { query, stageIndex }: ExploreSuggestionContext,
  column: Lib.ColumnMetadata,
): string {
  const info = Lib.displayInfo(query, stageIndex, column);
  return info.isFromJoin || info.isImplicitlyJoinable
    ? info.longDisplayName
    : info.displayName;
}

function isOwnColumn(
  { query, stageIndex }: ExploreSuggestionContext,
  column: Lib.ColumnMetadata,
): boolean {
  const info = Lib.displayInfo(query, stageIndex, column);
  return !info.isFromJoin && !info.isImplicitlyJoinable;
}

/** Columns whose name matches `needle`, best first; the table's own columns win ties. */
function findColumns(
  context: ExploreSuggestionContext,
  columns: Lib.ColumnMetadata[],
  needle: string,
): ColumnMatch[] {
  const { query, stageIndex } = context;
  return columns
    .map((column) => {
      const { displayName } = Lib.displayInfo(query, stageIndex, column);
      const score = Math.max(
        getMatchScore(displayName, needle),
        getMatchScore(getColumnLabel(context, column), needle) - 5,
      );
      return {
        column,
        score: score - (isOwnColumn(context, column) ? 0 : 3),
      };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score);
}

function isMeasurableColumn(column: Lib.ColumnMetadata): boolean {
  return (
    Lib.isNumeric(column) &&
    !Lib.isPrimaryKey(column) &&
    !Lib.isForeignKey(column) &&
    !Lib.isCoordinate(column)
  );
}

const AMOUNT_WORDS = ["total", "revenue", "amount", "sales", "price"];

/** Money-like columns first, so "sum" means "sum of Total" rather than "sum of Discount". */
function getAmountScore(
  { query, stageIndex }: ExploreSuggestionContext,
  column: Lib.ColumnMetadata,
): number {
  const name = Lib.displayInfo(
    query,
    stageIndex,
    column,
  ).displayName.toLowerCase();
  const words = name.split(/\W+/);
  const wordIndex = AMOUNT_WORDS.findIndex((word) => words.includes(word));
  return (
    (wordIndex >= 0 ? AMOUNT_WORDS.length - wordIndex : 0) +
    (Lib.isCurrency(column) ? 0.5 : 0)
  );
}

function isGroupableColumn(column: Lib.ColumnMetadata): boolean {
  return (
    !Lib.isPrimaryKey(column) &&
    !Lib.isForeignKey(column) &&
    !Lib.isDescription(column) &&
    !Lib.isURL(column)
  );
}

/* ---------------------------------------------------------------------------------------------
 * Aggregations
 * ------------------------------------------------------------------------------------------- */

type AggregationCandidate = {
  key: string;
  label: string;
  aggregable: Lib.Aggregable;
  score: number;
};

function findOperator(
  { query, stageIndex }: ExploreSuggestionContext,
  shortName: string,
): Lib.AggregationOperator | null {
  return (
    Lib.availableAggregationOperators(query, stageIndex).find(
      (operator) =>
        Lib.displayInfo(query, stageIndex, operator).shortName === shortName,
    ) ?? null
  );
}

function getCountCandidate(
  context: ExploreSuggestionContext,
  score: number,
): AggregationCandidate | null {
  const operator = findOperator(context, "count");
  return operator
    ? {
        key: "count",
        label: t`Count of rows`,
        aggregable: Lib.aggregationClause(operator),
        score,
      }
    : null;
}

function getOperatorCandidates(
  context: ExploreSuggestionContext,
  shortName: string,
  columnText: string,
): AggregationCandidate[] {
  const operator = findOperator(context, shortName);
  if (operator == null) {
    return [];
  }
  const { query, stageIndex } = context;
  const operatorName = Lib.displayInfo(query, stageIndex, operator).displayName;
  const columns = Lib.aggregationOperatorColumns(operator);
  const matches =
    columnText.length > 0
      ? findColumns(context, columns, columnText)
      : columns
          .filter(isMeasurableColumn)
          .filter((column) => isOwnColumn(context, column))
          .sort(
            (a, b) => getAmountScore(context, b) - getAmountScore(context, a),
          )
          .slice(0, 3)
          .map((column) => ({ column, score: 60 }));

  return matches.slice(0, 3).map(({ column, score }) => ({
    key: `${shortName}:${getColumnLabel(context, column)}`,
    label: getAggregationLabel(
      shortName,
      operatorName,
      getColumnLabel(context, column),
    ),
    aggregable: Lib.aggregationClause(operator, column),
    score,
  }));
}

function getAggregationLabel(
  shortName: string,
  operatorName: string,
  columnLabel: string,
): string {
  switch (shortName) {
    case "sum":
      return t`Sum of ${columnLabel}`;
    case "avg":
      return t`Average of ${columnLabel}`;
    case "distinct":
      return t`Distinct values of ${columnLabel}`;
    case "min":
      return t`Min of ${columnLabel}`;
    case "max":
      return t`Max of ${columnLabel}`;
    case "median":
      return t`Median of ${columnLabel}`;
    default:
      return `${operatorName} ${columnLabel}`;
  }
}

type NamedMetric = {
  displayName: string;
  aggregable: Lib.MetricMetadata | Lib.MeasureMetadata;
};

/** Saved metrics and measures of the same table, with their names. */
function getNamedMetrics({
  query,
  stageIndex,
}: ExploreSuggestionContext): NamedMetric[] {
  return [
    ...Lib.availableMetrics(query, stageIndex).map((metric) => ({
      displayName: Lib.displayInfo(query, stageIndex, metric).displayName,
      aggregable: metric,
    })),
    ...Lib.availableMeasures(query, stageIndex).map((measure) => ({
      displayName: Lib.displayInfo(query, stageIndex, measure).displayName,
      aggregable: measure,
    })),
  ];
}

function getMetricCandidates(
  context: ExploreSuggestionContext,
  needle: string,
): AggregationCandidate[] {
  return getNamedMetrics(context)
    .map(({ displayName, aggregable }) => ({
      key: `metric:${displayName}`,
      label: displayName,
      aggregable,
      score: getMatchScore(displayName, needle),
    }))
    .filter((candidate) => candidate.score > 0);
}

/** Calculations described by text like "count", "sum of total", "average price", or a metric's name. */
function parseAggregations(
  context: ExploreSuggestionContext,
  needle: string,
): AggregationCandidate[] {
  const match = AGGREGATION_PATTERN.exec(needle);
  const metricCandidates = getMetricCandidates(context, needle);
  if (match == null) {
    return metricCandidates;
  }

  const shortName = AGGREGATION_WORDS[match[1]];
  const columnText = (match[2] ?? "").trim();
  if (shortName === "count") {
    const distinctCandidates =
      columnText.length > 0
        ? getOperatorCandidates(context, "distinct", columnText)
        : [];
    const countCandidate = getCountCandidate(
      context,
      distinctCandidates.length > 0 ? 70 : 95,
    );
    return [
      ...distinctCandidates.map((candidate) => ({ ...candidate, score: 90 })),
      ...(countCandidate ? [countCandidate] : []),
      ...metricCandidates,
    ];
  }

  return [
    ...getOperatorCandidates(context, shortName, columnText).map(
      (candidate) => ({ ...candidate, score: 70 + candidate.score / 4 }),
    ),
    ...metricCandidates,
  ];
}

function aggregate(
  stageIndex: number,
  aggregable: Lib.Aggregable,
): (query: Lib.Query) => Lib.Query {
  return (query) => Lib.aggregate(query, stageIndex, aggregable);
}

function getAggregationPhraseSuggestions(
  context: ExploreSuggestionContext,
  needle: string,
): ExploreSuggestion[] {
  if (/\bby\b/.test(needle)) {
    return [];
  }
  return parseAggregations(context, needle)
    .filter(
      (candidate) => AGGREGATION_PATTERN.test(needle) || candidate.score >= 70,
    )
    .map((candidate) => ({
      id: `aggregation:${candidate.key}`,
      kind: "aggregation",
      label: candidate.label,
      hint: t`Calculate`,
      icon: candidate.key.startsWith("metric:") ? "metric" : "sum",
      score: candidate.score,
      apply: aggregate(context.stageIndex, candidate.aggregable),
    }));
}

function getMetricSuggestions(
  context: ExploreSuggestionContext,
  needle: string,
): ExploreSuggestion[] {
  if (AGGREGATION_PATTERN.test(needle) || /\bby\b/.test(needle)) {
    return [];
  }
  return getMetricCandidates(context, needle).map((candidate) => ({
    id: `aggregation:${candidate.key}`,
    kind: "aggregation",
    label: candidate.label,
    hint: t`Metric`,
    icon: "metric",
    score: candidate.score,
    apply: aggregate(context.stageIndex, candidate.aggregable),
  }));
}

/* ---------------------------------------------------------------------------------------------
 * Groupings
 * ------------------------------------------------------------------------------------------- */

type BreakoutCandidate = {
  key: string;
  label: string;
  column: Lib.ColumnMetadata;
  score: number;
};

function isAlreadyBrokenOut(
  { query, stageIndex }: ExploreSuggestionContext,
  column: Lib.ColumnMetadata,
): boolean {
  const { breakoutPositions = [] } = Lib.displayInfo(query, stageIndex, column);
  return breakoutPositions.length > 0;
}

function withBucket(
  { query, stageIndex }: ExploreSuggestionContext,
  column: Lib.ColumnMetadata,
): Lib.ColumnMetadata {
  return Lib.withDefaultBucket(query, stageIndex, column);
}

function getBreakoutLabel(
  context: ExploreSuggestionContext,
  column: Lib.ColumnMetadata,
): string {
  // a bucketed column's name already says how it's grouped, like "Created At: Month"
  return getColumnLabel(context, column);
}

/** The date column people most likely mean: when the row was created, then any date of the table. */
export function getDefaultDateColumn(
  context: ExploreSuggestionContext,
  columns: Lib.ColumnMetadata[],
): Lib.ColumnMetadata | null {
  const dateColumns = columns.filter(Lib.isDateOrDateTime);
  const ownDateColumns = dateColumns.filter((column) =>
    isOwnColumn(context, column),
  );
  return (
    ownDateColumns.find(
      (column) => Lib.isCreationTimestamp(column) || Lib.isCreationDate(column),
    ) ??
    ownDateColumns[0] ??
    dateColumns[0] ??
    null
  );
}

function getTemporalUnitBreakout(
  context: ExploreSuggestionContext,
  unit: TemporalUnitWord,
): BreakoutCandidate | null {
  const { query, stageIndex } = context;
  const column = getDefaultDateColumn(
    context,
    Lib.breakoutableColumns(query, stageIndex),
  );
  if (column == null) {
    return null;
  }
  const bucket = Lib.availableTemporalBuckets(query, stageIndex, column).find(
    (bucket) => Lib.displayInfo(query, stageIndex, bucket).shortName === unit,
  );
  if (bucket == null) {
    return null;
  }
  const bucketedColumn = Lib.withTemporalBucket(column, bucket);
  return {
    key: `${getColumnLabel(context, column)}:${unit}`,
    label: getBreakoutLabel(context, bucketedColumn),
    column: bucketedColumn,
    score: 95,
  };
}

/** Groupings described by text like "state", "category", or a time unit like "month". */
function parseBreakouts(
  context: ExploreSuggestionContext,
  needle: string,
): BreakoutCandidate[] {
  const unit = TEMPORAL_UNITS.find(
    (unit) => needle === unit || needle === `${unit}s`,
  );
  const unitCandidate = unit ? getTemporalUnitBreakout(context, unit) : null;
  if (unitCandidate) {
    return [unitCandidate];
  }

  const { query, stageIndex } = context;
  return findColumns(
    context,
    Lib.breakoutableColumns(query, stageIndex).filter(isGroupableColumn),
    needle,
  ).map(({ column, score }) => {
    const bucketedColumn = withBucket(context, column);
    return {
      key: getColumnLabel(context, column),
      label: getBreakoutLabel(context, bucketedColumn),
      column: bucketedColumn,
      // grouping by a raw number is rarely what people mean
      score: isMeasurableColumn(column) ? score - 30 : score,
    };
  });
}

function breakout(
  stageIndex: number,
  column: Lib.ColumnMetadata,
): (query: Lib.Query) => Lib.Query {
  return (query) => Lib.breakout(query, stageIndex, column);
}

function getColumnSuggestions(
  context: ExploreSuggestionContext,
  needle: string,
): ExploreSuggestion[] {
  if (/\bby\b/.test(needle) || COMPARISON_PATTERN.test(needle)) {
    return [];
  }
  const { query, stageIndex } = context;
  const breakouts = parseBreakouts(context, needle)
    .filter((candidate) => !isAlreadyBrokenOut(context, candidate.column))
    .slice(0, 3)
    .map(
      (candidate): ExploreSuggestion => ({
        id: `breakout:${candidate.key}`,
        kind: "breakout",
        label: t`Group by ${candidate.label}`,
        icon: Lib.isTemporal(candidate.column) ? "calendar" : "split",
        score: candidate.score - 2,
        apply: breakout(stageIndex, candidate.column),
      }),
    );

  const measurableMatches = findColumns(
    context,
    Lib.visibleColumns(query, stageIndex).filter(isMeasurableColumn),
    needle,
  ).slice(0, 2);
  const calculations = measurableMatches.flatMap(({ column, score }) =>
    (["sum", "avg"] as const).flatMap((shortName, index) =>
      getOperatorCandidates(context, shortName, getColumnLabel(context, column))
        .slice(0, 1)
        .map(
          (candidate): ExploreSuggestion => ({
            id: `aggregation:${candidate.key}`,
            kind: "aggregation",
            label: candidate.label,
            hint: t`Calculate`,
            icon: "sum",
            score: score - 5 - index * 5,
            apply: aggregate(stageIndex, candidate.aggregable),
          }),
        ),
    ),
  );

  return [...breakouts, ...calculations];
}

/* ---------------------------------------------------------------------------------------------
 * Whole summaries: "count by month", "sum of total by state", "by category"
 * ------------------------------------------------------------------------------------------- */

function getSummarySuggestions(
  context: ExploreSuggestionContext,
  needle: string,
): ExploreSuggestion[] {
  const match = /^(.*?)\s*\bby\s+(.+)$/.exec(needle);
  if (match == null) {
    return [];
  }
  const [, aggregationText, breakoutText] = match;
  const { stageIndex } = context;
  const breakouts = parseBreakouts(context, breakoutText.trim()).slice(0, 2);
  if (breakouts.length === 0) {
    return [];
  }

  if (aggregationText.trim().length === 0) {
    return breakouts
      .filter((candidate) => !isAlreadyBrokenOut(context, candidate.column))
      .map((candidate) => ({
        id: `breakout:${candidate.key}`,
        kind: "breakout",
        label: t`Group by ${candidate.label}`,
        icon: Lib.isTemporal(candidate.column) ? "calendar" : "split",
        score: 90 + candidate.score / 10,
        apply: breakout(stageIndex, candidate.column),
      }));
  }

  const parsedAggregations = parseAggregations(context, aggregationText.trim());
  const countCandidate = getCountCandidate(context, 60);
  const aggregations =
    parsedAggregations.length > 0
      ? parsedAggregations.slice(0, 2)
      : countCandidate
        ? [{ ...countCandidate, label: t`Count of ${aggregationText.trim()}` }]
        : [];

  return aggregations.flatMap((aggregation) =>
    breakouts.map(
      (candidate): ExploreSuggestion => ({
        id: `summary:${aggregation.key}:${candidate.key}`,
        kind: "summary",
        label: t`${aggregation.label} by ${candidate.label}`,
        hint: t`Summarize`,
        icon: Lib.isTemporal(candidate.column) ? "line" : "bar",
        score: 100 + (aggregation.score + candidate.score) / 100,
        apply: (query) =>
          Lib.breakout(
            Lib.aggregate(query, stageIndex, aggregation.aggregable),
            stageIndex,
            candidate.column,
          ),
      }),
    ),
  );
}

/* ---------------------------------------------------------------------------------------------
 * Filters
 * ------------------------------------------------------------------------------------------- */

function filter(
  stageIndex: number,
  clause: Lib.ExpressionClause,
): (query: Lib.Query) => Lib.Query {
  return (query) => Lib.filter(query, stageIndex, clause);
}

function getDateFilterSuggestions(
  context: ExploreSuggestionContext,
  needle: string,
): ExploreSuggestion[] {
  const range = parseRelativeDateRange(needle);
  if (range == null) {
    return [];
  }
  const { query, stageIndex } = context;
  const column = getDefaultDateColumn(
    context,
    Lib.filterableColumns(query, stageIndex),
  );
  if (column == null) {
    return [];
  }
  const clause = Lib.relativeDateFilterClause({
    column,
    value: range.value,
    unit: range.unit,
    offsetValue: null,
    offsetUnit: null,
    options: {},
  });
  const nextQuery = Lib.filter(query, stageIndex, clause);
  const addedFilter = Lib.filters(nextQuery, stageIndex).at(-1);
  const label = addedFilter
    ? Lib.displayInfo(nextQuery, stageIndex, addedFilter).displayName
    : needle;

  return [
    {
      id: `filter:date:${range.value}:${range.unit}`,
      kind: "filter",
      label,
      hint: t`Filter`,
      icon: "calendar",
      score: 98,
      apply: filter(stageIndex, clause),
    },
  ];
}

type RelativeDateRange = {
  value: number;
  unit: TemporalUnitWord;
};

/** "last 30 days", "past week", "next 3 months", "this year", "today", "yesterday". */
export function parseRelativeDateRange(
  needle: string,
): RelativeDateRange | null {
  if (needle === "today") {
    return { value: 0, unit: "day" };
  }
  if (needle === "yesterday") {
    return { value: -1, unit: "day" };
  }
  const currentMatch = CURRENT_DATE_PATTERN.exec(needle);
  if (currentMatch) {
    return { value: 0, unit: toTemporalUnit(currentMatch[1]) };
  }
  const relativeMatch = RELATIVE_DATE_PATTERN.exec(needle);
  if (relativeMatch) {
    const [, direction, count, unit] = relativeMatch;
    const amount = count ? parseInt(count, 10) : 1;
    return {
      value: direction === "next" ? amount : -amount,
      unit: toTemporalUnit(unit),
    };
  }
  return null;
}

function toTemporalUnit(word: string): TemporalUnitWord {
  return TEMPORAL_UNITS.find((unit) => unit === word) ?? "day";
}

function parseNumber(text: string): number | null {
  const normalizedText = text.replace(/[$,%\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(normalizedText)) {
    return null;
  }
  return parseFloat(normalizedText);
}

/** "price over 50", "rating >= 4", "category is widget", "title contains wool". */
function getComparisonSuggestions(
  context: ExploreSuggestionContext,
  needle: string,
): ExploreSuggestion[] {
  const match = COMPARISON_PATTERN.exec(needle);
  if (match == null) {
    return [];
  }
  const [, columnText, comparisonText, valueText] = match;
  const comparison = COMPARISON_WORDS[comparisonText.trim()];
  if (comparison == null) {
    return [];
  }
  const { query, stageIndex } = context;
  const columns = findColumns(
    context,
    Lib.filterableColumns(query, stageIndex),
    columnText.trim(),
  ).slice(0, 2);

  return columns.flatMap(({ column, score }) => {
    const clause = getComparisonClause(context, column, comparison, valueText);
    if (clause == null) {
      return [];
    }
    const nextQuery = Lib.filter(query, stageIndex, clause);
    const addedFilter = Lib.filters(nextQuery, stageIndex).at(-1);
    const label = addedFilter
      ? Lib.displayInfo(nextQuery, stageIndex, addedFilter).displayName
      : needle;
    return [
      {
        id: `filter:${label}`,
        kind: "filter" as const,
        label,
        hint: t`Filter`,
        icon: "filter" as const,
        score: 90 + score / 10,
        apply: filter(stageIndex, clause),
      },
    ];
  });
}

function getComparisonClause(
  context: ExploreSuggestionContext,
  column: Lib.ColumnMetadata,
  comparison: ComparisonWord,
  valueText: string,
): Lib.ExpressionClause | null {
  const value = valueText.trim();
  if (Lib.isNumeric(column)) {
    const number = parseNumber(value);
    if (number == null || comparison === "contains") {
      return null;
    }
    return Lib.numberFilterClause({
      operator: comparison,
      column,
      values: [number],
    });
  }
  if (Lib.isStringOrStringLike(column)) {
    if (
      comparison !== "=" &&
      comparison !== "!=" &&
      comparison !== "contains"
    ) {
      return null;
    }
    return Lib.stringFilterClause({
      operator: comparison,
      column,
      values: [getKnownValue(context, column, value) ?? value],
      options: comparison === "contains" ? { caseSensitive: false } : {},
    });
  }
  return null;
}

/** The value as stored, so "gadget" filters on "Gadget". */
function getKnownValue(
  { columnValues = [], query, stageIndex }: ExploreSuggestionContext,
  column: Lib.ColumnMetadata,
  value: string,
): string | null {
  const { name } = Lib.displayInfo(query, stageIndex, column);
  const options = columnValues.find(
    (option) => Lib.displayInfo(query, stageIndex, option.column).name === name,
  );
  return (
    options?.values.find(
      (knownValue) => knownValue.toLowerCase() === value.toLowerCase(),
    ) ?? null
  );
}

/** "gadget" → "Category is Gadget", from the known values of list-type columns. */
function getValueSuggestions(
  context: ExploreSuggestionContext,
  needle: string,
): ExploreSuggestion[] {
  const { columnValues = [], stageIndex } = context;
  if (needle.length < MIN_MATCH_LENGTH) {
    return [];
  }
  return columnValues.flatMap(({ column, values }) =>
    values
      .map((value) => ({ value, score: getMatchScore(value, needle) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ value, score }): ExploreSuggestion => {
        const columnLabel = getColumnLabel(context, column);
        return {
          id: `filter:value:${columnLabel}:${value}`,
          kind: "filter",
          label: t`${columnLabel} is ${value}`,
          hint: t`Filter`,
          icon: "filter",
          score: score === 100 ? 97 : score - 5,
          apply: filter(
            stageIndex,
            Lib.stringFilterClause({
              operator: "=",
              column,
              values: [value],
              options: {},
            }),
          ),
        };
      }),
  );
}

/* ---------------------------------------------------------------------------------------------
 * Search
 * ------------------------------------------------------------------------------------------- */

/**
 * The column a search filters on: an entity name ("Name", "Title") of the table itself, then one
 * from a linked table, then any text column of the table itself, then any text column.
 */
export function getSearchColumn(
  context: ExploreSuggestionContext,
): Lib.ColumnMetadata | null {
  const { query, stageIndex } = context;
  const columns = Lib.filterableColumns(query, stageIndex);
  const ownColumns = columns.filter((column) => isOwnColumn(context, column));
  const isNameColumn = (column: Lib.ColumnMetadata) =>
    Lib.isEntityName(column) || Lib.isTitle(column);

  return (
    ownColumns.find(isNameColumn) ??
    columns.find(isNameColumn) ??
    ownColumns.find(Lib.isStringOrStringLike) ??
    columns.find(Lib.isStringOrStringLike) ??
    null
  );
}

function getSearchSuggestions(
  context: ExploreSuggestionContext,
  text: string,
): ExploreSuggestion[] {
  const column = getSearchColumn(context);
  if (column == null) {
    return [];
  }
  const columnLabel = getColumnLabel(context, column);
  return [
    {
      id: `search:${text}`,
      kind: "search",
      label: t`Search “${text}” in ${columnLabel}`,
      icon: "search",
      score: 55,
      apply: filter(
        context.stageIndex,
        Lib.stringFilterClause({
          operator: "contains",
          column,
          values: [text],
          options: { caseSensitive: false },
        }),
      ),
    },
  ];
}

/* ---------------------------------------------------------------------------------------------
 * Custom expressions: "= [Price] * 2", "= Sum([Total]) / Count()", "= [Rating] >= 4"
 * ------------------------------------------------------------------------------------------- */

function getExpressionSuggestions(
  context: ExploreSuggestionContext,
  source: string,
): ExploreSuggestion[] {
  const { query, stageIndex } = context;
  if (source.length === 0) {
    return [];
  }
  const availableColumns = Lib.expressionableColumns(query, stageIndex);
  const availableMetrics = Lib.availableMetrics(query, stageIndex);
  const compile = (expressionMode: Lib.ExpressionMode) =>
    diagnoseAndCompile({
      source,
      expressionMode,
      query,
      stageIndex,
      availableColumns,
      availableMetrics,
    });

  const suggestions: ExploreSuggestion[] = [];
  const aggregation = compile("aggregation");
  if (aggregation.expressionClause) {
    const clause = aggregation.expressionClause;
    suggestions.push({
      id: `expression:aggregation:${source}`,
      kind: "aggregation",
      label: source,
      hint: t`Calculate`,
      icon: "sum",
      score: 100,
      apply: (query) => Lib.aggregate(query, stageIndex, clause),
    });
  }
  const filterResult = compile("filter");
  if (filterResult.expressionClause) {
    suggestions.push({
      id: `expression:filter:${source}`,
      kind: "filter",
      label: source,
      hint: t`Filter`,
      icon: "filter",
      score: 99,
      apply: filter(stageIndex, filterResult.expressionClause),
    });
  }
  const column = compile("expression");
  if (column.expressionClause && filterResult.expressionClause == null) {
    const clause = column.expressionClause;
    suggestions.push({
      id: `expression:column:${source}`,
      kind: "column",
      label: getDefaultColumnName(source),
      hint: t`New column`,
      icon: "add_column",
      score: 98,
      apply: (query) => {
        const name = getUniqueColumnName(
          query,
          stageIndex,
          getDefaultColumnName(source),
        );
        return Lib.expression(
          query,
          stageIndex,
          name,
          Lib.withExpressionName(clause, name),
        );
      },
    });
  }

  if (suggestions.length > 0) {
    return suggestions;
  }
  const error = aggregation.error ?? filterResult.error ?? column.error ?? null;
  return [
    {
      id: `invalid:${source}`,
      kind: "invalid",
      label: error?.message ?? t`That formula doesn't look right`,
      icon: "warning",
      score: 0,
      apply: null,
    },
  ];
}

const DEFAULT_COLUMN_NAME_MAX_LENGTH = 40;

/** A readable default name for a formula: `[Price] / 2` becomes "Price / 2". */
export function getDefaultColumnName(source: string): string {
  const name = source
    .replace(/\[([^\]]*)\]?/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return name.length > DEFAULT_COLUMN_NAME_MAX_LENGTH
    ? `${name.slice(0, DEFAULT_COLUMN_NAME_MAX_LENGTH - 1).trimEnd()}…`
    : name;
}

function getUniqueColumnName(
  query: Lib.Query,
  stageIndex: number,
  name: string,
): string {
  const takenNames = new Set(
    Lib.returnedColumns(query, stageIndex).map(
      (column) => Lib.displayInfo(query, stageIndex, column).displayName,
    ),
  );
  let uniqueName = name;
  for (let suffix = 2; takenNames.has(uniqueName); suffix++) {
    uniqueName = `${name} (${suffix})`;
  }
  return uniqueName;
}

/* ---------------------------------------------------------------------------------------------
 * Starters, shown before anything is typed
 * ------------------------------------------------------------------------------------------- */

function getStarterSuggestions(
  context: ExploreSuggestionContext,
): ExploreSuggestion[] {
  const { query, stageIndex } = context;
  const hasAggregations = Lib.aggregations(query, stageIndex).length > 0;
  const suggestions: ExploreSuggestion[] = [];

  if (!hasAggregations) {
    const count = getCountCandidate(context, 0);
    if (count) {
      suggestions.push({
        id: "starter:count",
        kind: "aggregation",
        label: count.label,
        hint: t`Calculate`,
        icon: "sum",
        score: 90,
        apply: aggregate(stageIndex, count.aggregable),
      });
    }
    const [sum] = getOperatorCandidates(context, "sum", "");
    if (sum) {
      suggestions.push({
        id: `starter:${sum.key}`,
        kind: "aggregation",
        label: sum.label,
        hint: t`Calculate`,
        icon: "sum",
        score: 85,
        apply: aggregate(stageIndex, sum.aggregable),
      });
    }
  }

  getStarterBreakouts(context).forEach((column, index) => {
    const label = getBreakoutLabel(context, column);
    suggestions.push({
      id: `starter:breakout:${label}`,
      kind: "breakout",
      label: t`Group by ${label}`,
      icon: Lib.isTemporal(column) ? "calendar" : "split",
      score: 80 - index,
      apply: breakout(stageIndex, column),
    });
  });

  Lib.availableMetrics(query, stageIndex)
    .slice(0, 2)
    .forEach((metric, index) => {
      const { displayName } = Lib.displayInfo(query, stageIndex, metric);
      suggestions.push({
        id: `starter:metric:${displayName}`,
        kind: "aggregation",
        label: displayName,
        hint: t`Metric`,
        icon: "metric",
        score: 70 - index,
        apply: aggregate(stageIndex, metric),
      });
    });

  return rankSuggestions(suggestions);
}

/** Good first groupings: the main date, then a few categories and locations not used yet. */
export function getStarterBreakouts(
  context: ExploreSuggestionContext,
  limit = 3,
): Lib.ColumnMetadata[] {
  const { query, stageIndex } = context;
  const columns = Lib.breakoutableColumns(query, stageIndex)
    .filter(isGroupableColumn)
    .filter((column) => !isAlreadyBrokenOut(context, column));
  const dateColumn = getDefaultDateColumn(context, columns);
  const categoryColumns = columns.filter(
    (column) =>
      (Lib.isCategory(column) ||
        Lib.isState(column) ||
        Lib.isCountry(column)) &&
      !Lib.isEntityName(column) &&
      !Lib.isTitle(column),
  );
  return [...(dateColumn ? [dateColumn] : []), ...categoryColumns]
    .slice(0, limit)
    .map((column) => withBucket(context, column));
}

/* ---------------------------------------------------------------------------------------------
 * Comparisons: other calculations to show next to the current ones
 * ------------------------------------------------------------------------------------------- */

function getAggregationDisplayNames({
  query,
  stageIndex,
}: ExploreSuggestionContext): Set<string> {
  return new Set(
    Lib.aggregations(query, stageIndex).map(
      (aggregation) =>
        Lib.displayInfo(query, stageIndex, aggregation).displayName,
    ),
  );
}

/** Other calculations to plot next to the current ones: metrics first, then common ones. */
export function getCompareSuggestions(
  context: ExploreSuggestionContext,
  limit = 4,
): ExploreSuggestion[] {
  const { query, stageIndex } = context;
  const takenNames = getAggregationDisplayNames(context);
  const metrics = getNamedMetrics(context).map(
    ({ displayName, aggregable }): AggregationCandidate => ({
      key: `metric:${displayName}`,
      label: displayName,
      aggregable,
      score: 0,
    }),
  );
  const count = getCountCandidate(context, 0);
  const calculations = [
    ...(count ? [count] : []),
    ...getOperatorCandidates(context, "sum", ""),
    ...getOperatorCandidates(context, "avg", "").slice(0, 1),
  ];

  return [...metrics, ...calculations]
    .filter((candidate) => {
      const nextQuery = Lib.aggregate(query, stageIndex, candidate.aggregable);
      const added = Lib.aggregations(nextQuery, stageIndex).at(-1);
      const addedName = added
        ? Lib.displayInfo(nextQuery, stageIndex, added).displayName
        : candidate.label;
      return !takenNames.has(addedName);
    })
    .slice(0, limit)
    .map((candidate) => ({
      id: `compare:${candidate.key}`,
      kind: "aggregation",
      label: candidate.label,
      icon: candidate.key.startsWith("metric:") ? "metric" : "sum",
      score: 0,
      apply: aggregate(stageIndex, candidate.aggregable),
    }));
}
