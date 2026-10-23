import type { QueryBuilderMode } from "metabase/redux/store";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type {
  CardDisplayType,
  VisualizationSettings,
} from "metabase-types/api";

export const STAGE_INDEX = -1;

/**
 * Whether the question is driven by the explore bar: a saved or ad-hoc question on a table or
 * a saved question, editable, in the view mode of the query builder.
 */
export function isExploreModeQuestion(
  question: Question,
  queryBuilderMode: QueryBuilderMode,
): boolean {
  const query = question.query();
  const { isEditable, isNative } = Lib.queryDisplayInfo(query);
  return (
    queryBuilderMode === "view" &&
    !isNative &&
    isEditable &&
    !question.isArchived() &&
    Lib.sourceTableOrCardId(query) != null
  );
}

export type ExploreView = "chart" | "pivot" | "table";

const NON_CHART_DISPLAYS: CardDisplayType[] = ["table", "pivot", "object"];

/** How the summarized result is shown right now. */
export function getExploreView(question: Question): ExploreView {
  const display = question.display();
  if (display === "pivot") {
    return "pivot";
  }
  return NON_CHART_DISPLAYS.includes(display) ? "table" : "chart";
}

export function isSummarized(query: Lib.Query): boolean {
  return (
    Lib.aggregations(query, STAGE_INDEX).length > 0 ||
    Lib.breakouts(query, STAGE_INDEX).length > 0
  );
}

/**
 * The question with a new query, showing it in a way that fits its new shape: a pivot stays a
 * pivot while it has groupings; any other display picks itself unless someone chose it and the
 * groupings didn't change, since a chosen chart may not fit the new groupings.
 */
export function withExploreQuery(
  question: Question,
  nextQuery: Lib.Query,
): Question {
  const nextQuestion = question.setQuery(nextQuery);
  const breakoutCount = Lib.breakouts(nextQuery, STAGE_INDEX).length;
  const hasNewGroupings =
    breakoutCount !== Lib.breakouts(question.query(), STAGE_INDEX).length;
  const isPivot = nextQuestion.display() === "pivot";

  if (!isSummarized(nextQuery) || (isPivot && breakoutCount === 0)) {
    return nextQuestion.setDisplayIsLocked(false).setDefaultDisplay();
  }
  if (hasNewGroupings && !isPivot) {
    return nextQuestion.setDisplayIsLocked(false).setDefaultDisplay();
  }
  if (isPivot) {
    return nextQuestion.updateSettings(
      getPivotSettings(nextQuery, getPivotRowNames(question, nextQuery)),
    );
  }
  return nextQuestion.setDefaultDisplay();
}

/** Result column names of the query's groupings, in breakout order. */
export function getBreakoutNames(query: Lib.Query): string[] {
  return Lib.returnedColumns(query, STAGE_INDEX)
    .map((column) => Lib.displayInfo(query, STAGE_INDEX, column))
    .filter((info) => info.isBreakout)
    .map((info) => info.name);
}

function getAggregationNames(query: Lib.Query): string[] {
  return Lib.returnedColumns(query, STAGE_INDEX)
    .map((column) => Lib.displayInfo(query, STAGE_INDEX, column))
    .filter((info) => info.isAggregation)
    .map((info) => info.name);
}

/**
 * The groupings a pivot shows as rows. Groupings the pivot doesn't know about yet become rows,
 * so adding one from the bar doesn't reshuffle the columns.
 */
export function getPivotRowNames(
  question: Question,
  query: Lib.Query = question.query(),
): string[] {
  const breakoutNames = getBreakoutNames(query);
  const split = question.settings()["pivot_table.column_split"];
  const columnNames = new Set(
    split?.columns.filter((name) => typeof name === "string") ?? [],
  );
  if (question.display() !== "pivot" || split == null) {
    return breakoutNames.slice(0, Math.max(breakoutNames.length - 1, 1));
  }
  return breakoutNames.filter((name) => !columnNames.has(name));
}

export function getPivotSettings(
  query: Lib.Query,
  rowNames: string[],
): Partial<VisualizationSettings> {
  const breakoutNames = getBreakoutNames(query);
  const rows = breakoutNames.filter((name) => rowNames.includes(name));
  return {
    "pivot_table.column_split": {
      rows,
      columns: breakoutNames.filter((name) => !rows.includes(name)),
      values: getAggregationNames(query),
    },
  };
}

/**
 * The same summary in another shape. Moving between a pivot and a chart keeps the layout:
 * the pivot's rows are the chart's x-axis and its columns are the chart's series.
 */
export function switchExploreView(
  question: Question,
  view: ExploreView,
): Question {
  const query = question.query();
  const breakoutNames = getBreakoutNames(query);

  if (view === "pivot") {
    const dimensions = question.settings()["graph.dimensions"];
    const rowNames =
      question.display() !== "pivot" && dimensions?.length
        ? dimensions.slice(0, 1).filter((name) => name != null)
        : getPivotRowNames(question);
    return question
      .setDisplay("pivot")
      .lockDisplay()
      .updateSettings(getPivotSettings(query, rowNames));
  }

  if (view === "table") {
    return question.setDisplay("table").lockDisplay();
  }

  const chartDisplay = getChartDisplay(query);
  const chartQuestion = question
    .setDisplayIsLocked(false)
    .setDisplay(chartDisplay)
    .lockDisplay();
  if (question.display() !== "pivot" || breakoutNames.length < 2) {
    return chartQuestion;
  }
  const rowNames = getPivotRowNames(question);
  const orderedNames = [
    ...breakoutNames.filter((name) => rowNames.includes(name)),
    ...breakoutNames.filter((name) => !rowNames.includes(name)),
  ];
  return chartQuestion.updateSettings({
    "graph.dimensions": orderedNames.slice(0, 2),
  });
}

/** The chart that fits the summary best; a bar chart when nothing fits better. */
export function getChartDisplay(query: Lib.Query): CardDisplayType {
  const { display } = Lib.defaultDisplay(query);
  if (!NON_CHART_DISPLAYS.includes(display)) {
    return display;
  }
  const breakoutCount = Lib.breakouts(query, STAGE_INDEX).length;
  return breakoutCount === 0 ? "scalar" : "bar";
}

/** Charts only show up to two groupings. */
export function canShowAsChart(query: Lib.Query): boolean {
  return Lib.breakouts(query, STAGE_INDEX).length <= 2;
}
