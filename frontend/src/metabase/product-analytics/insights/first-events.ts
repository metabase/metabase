import type { DatasetData, RowValue } from "metabase-types/api";

import {
  CONVERTED_WEIGHT_COLUMN,
  FIRST_EVENT_COLUMN,
  type FunnelPathsRange,
  RANGE_COLUMN,
} from "../sql/analyses/funnel-paths";

import { toCount } from "./rows";
import type { GroupCounts, Insight } from "./types";

/**
 * The condition attribute for what someone did first after a funnel step. It
 * isn't a table column, so it can't clash with one.
 */
export const FIRST_EVENT_ATTRIBUTE_ID = "(first event)";

export const isFirstEventInsight = (insight: Pick<Insight, "conditions">) =>
  insight.conditions.some(
    ({ attributeId }) => attributeId === FIRST_EVENT_ATTRIBUTE_ID,
  );

/** A funnel paths result with first events, split by transition. */
export type FunnelPathsResult = {
  /** See `getFirstEventCounts`. */
  counts: GroupCounts[];
  /** Each transition's paths chart. */
  charts: ReadonlyMap<number, DatasetData>;
};

const SANKEY_HIDDEN_COLUMNS = [FIRST_EVENT_COLUMN, CONVERTED_WEIGHT_COLUMN];

type ResultRows = {
  columnNames: readonly string[];
  rows: readonly (readonly RowValue[])[];
  transitionRanges: readonly FunnelPathsRange[];
};

const getTransitionOf = ({ columnNames, transitionRanges }: ResultRows) => {
  const rangeIndex = columnNames.indexOf(RANGE_COLUMN);
  return (row: readonly RowValue[]) => {
    const range = toCount(row[rangeIndex]);
    return range !== undefined ? transitionRanges[range - 1]?.start : undefined;
  };
};

const isEdgeRow = (columnNames: readonly string[], row: readonly RowValue[]) =>
  row[columnNames.indexOf("source")] !== "";

/**
 * People by the first thing they did after each transition's starting step,
 * plus each transition's total, from a funnel paths result with first events
 * whose ranges are `transitionRanges`. Only people who did something other
 * than the next step are counted: going straight on, or doing nothing, would
 * say whether they converted. Rows that can't be read are skipped.
 */
export const getFirstEventCounts = (result: ResultRows): GroupCounts[] => {
  const { columnNames, rows, transitionRanges } = result;
  const transitionOf = getTransitionOf(result);
  const firstEventIndex = columnNames.indexOf(FIRST_EVENT_COLUMN);
  const weightIndex = columnNames.indexOf("weight");
  const convertedIndex = columnNames.indexOf(CONVERTED_WEIGHT_COLUMN);

  const firstEventCounts = rows.flatMap((row): GroupCounts[] => {
    const transition = transitionOf(row);
    const value = row[firstEventIndex];
    const reached = toCount(row[weightIndex]);
    const converted = toCount(row[convertedIndex]);
    const isFirstEventRow =
      !isEdgeRow(columnNames, row) && typeof value === "string" && value !== "";
    return isFirstEventRow &&
      transition !== undefined &&
      reached !== undefined &&
      converted !== undefined
      ? [
          {
            transition,
            conditions: [{ attributeId: FIRST_EVENT_ATTRIBUTE_ID, value }],
            reached,
            converted,
          },
        ]
      : [];
  });
  const totals = transitionRanges.map(({ start }): GroupCounts => {
    const ofTransition = firstEventCounts.filter(
      ({ transition }) => transition === start,
    );
    return {
      transition: start,
      conditions: [],
      reached: ofTransition.reduce((sum, { reached }) => sum + reached, 0),
      converted: ofTransition.reduce(
        (sum, { converted }) => sum + converted,
        0,
      ),
    };
  });
  return [...totals, ...firstEventCounts];
};

/** Reads a funnel paths result with first events, whose ranges are `transitionRanges`. */
export const parseFunnelPathsResult = (
  data: DatasetData,
  transitionRanges: readonly FunnelPathsRange[],
): FunnelPathsResult => {
  const result: ResultRows = {
    columnNames: data.cols.map(({ name }) => name),
    rows: data.rows,
    transitionRanges,
  };
  const { columnNames } = result;
  const transitionOf = getTransitionOf(result);
  const shownIndexes = columnNames.flatMap((name, index) =>
    SANKEY_HIDDEN_COLUMNS.includes(name) ? [] : [index],
  );
  const charts = new Map(
    transitionRanges.map(({ start }) => {
      const rows = data.rows
        .filter(
          (row) => isEdgeRow(columnNames, row) && transitionOf(row) === start,
        )
        .map((row) => shownIndexes.map((index) => row[index]));
      const chart: DatasetData = {
        ...data,
        cols: shownIndexes.map((index) => data.cols[index]),
        rows,
      };
      return [start, chart];
    }),
  );

  return { counts: getFirstEventCounts(result), charts };
};
