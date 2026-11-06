import type {
  AnalysisSpec,
  BreakoutGroup,
  BreakoutSpec,
} from "../../spec/types";
import { lit } from "../compile/dialect";
import { flagSql } from "../compile/flag";
import type { Cte } from "../compose";

/** The column the planners read on `events_base` when breaking out by a property. */
export const BREAKOUT_PROPERTY_COLUMN = "breakout_property";

/** The result column with each row's group. */
export const BREAKOUT_COLUMN = "breakout";

/** The CTE with a row per actor per group they're in: `actor`, `breakout`. */
export const ACTOR_BREAKOUTS_CTE = "actor_breakouts";

/** On `scoped_events`: the property's value, or the labels of the groups the event's person is in. */
export const BREAKOUT_VALUE_COLUMN = "breakout_value";
const BREAKOUT_LABELS_COLUMN = "breakout_labels";

/** The labels of the groups an event's person is in, in the groups' order. */
const groupLabelsSql = (groups: readonly BreakoutGroup[]): string => {
  const labels = groups.map(({ label, segment }) =>
    segment === undefined
      ? lit(label)
      : `if(${flagSql(segment.flag)} = ${segment.isMember ? 1 : 0}, ${lit(label)}, '')`,
  );
  return `arrayFilter(label -> label != '', [${labels.join(", ")}])`;
};

/** What `scoped_events` carries for the breakout. */
export const breakoutEventColumns = (
  breakout: BreakoutSpec,
): { as: string; sql: string }[] => {
  switch (breakout.type) {
    case "property":
      return [
        {
          as: BREAKOUT_VALUE_COLUMN,
          sql: `ifNull(toString(${BREAKOUT_PROPERTY_COLUMN}), '')`,
        },
      ];
    case "segments":
      return [
        { as: BREAKOUT_LABELS_COLUMN, sql: groupLabelsSql(breakout.groups) },
      ];
  }
};

/**
 * The groups each actor is in. A property gives each actor one, their first
 * touchpoint's: the first non-empty value on the events `anchor` picks out of
 * `scoped_events`, like a funnel's steps, or on any of them without one. A
 * value that changes later doesn't move them, and an actor with no value
 * there is in the empty group. Segments give each actor every group they're
 * in, so an actor can count in several.
 */
export const actorBreakoutsCte = (
  breakout: BreakoutSpec,
  anchor?: string,
): Cte => {
  switch (breakout.type) {
    case "property": {
      const condition = [
        `${BREAKOUT_VALUE_COLUMN} != ''`,
        ...(anchor !== undefined ? [`(${anchor})`] : []),
      ].join(" AND ");
      return {
        name: ACTOR_BREAKOUTS_CTE,
        note: "each actor's value of the property at their first touchpoint",
        deps: ["scoped_events"],
        body: [
          "SELECT",
          "  actor,",
          `  argMinIf(${BREAKOUT_VALUE_COLUMN}, ts, ${condition}) AS ${BREAKOUT_COLUMN}`,
          "FROM scoped_events",
          "GROUP BY actor",
        ].join("\n"),
      };
    }
    case "segments":
      return {
        name: ACTOR_BREAKOUTS_CTE,
        note: "a row per actor per group they're in",
        deps: ["scoped_events"],
        body: [
          `SELECT actor, ${BREAKOUT_COLUMN}`,
          "FROM (",
          // A person's segments are the same on every event.
          `  SELECT actor, any(${BREAKOUT_LABELS_COLUMN}) AS labels`,
          "  FROM scoped_events",
          "  GROUP BY actor",
          ")",
          `ARRAY JOIN labels AS ${BREAKOUT_COLUMN}`,
        ].join("\n"),
      };
  }
};

/**
 * `source`'s rows, which have an `actor`, once per group their actor is in,
 * with a `breakout` column. Just `source` without a breakout. Join after
 * aggregating to actors, so events aren't repeated per group.
 */
export const withBreakout = (spec: AnalysisSpec, source: string): string =>
  spec.breakout === undefined
    ? source
    : `(SELECT s.*, b.${BREAKOUT_COLUMN} AS ${BREAKOUT_COLUMN} FROM ${source} AS s INNER JOIN ${ACTOR_BREAKOUTS_CTE} AS b ON b.actor = s.actor)`;

/** What a CTE that uses `withBreakout` depends on, beyond its source. */
export const breakoutDeps = (spec: AnalysisSpec): string[] =>
  spec.breakout !== undefined ? [ACTOR_BREAKOUTS_CTE] : [];

/** The `breakout` column first, when there is one, for SELECT lists. */
export const breakoutSelect = (spec: AnalysisSpec): string[] =>
  spec.breakout !== undefined ? [`  ${BREAKOUT_COLUMN},`] : [];

/** `breakout, ` when there is one, for GROUP BY lists. */
export const breakoutGroupBy = (spec: AnalysisSpec): string =>
  spec.breakout !== undefined ? `${BREAKOUT_COLUMN}, ` : "";

/**
 * How to sort by group: segment groups keep their order, and a property's
 * values sort by name with the empty value last. Sort by group before
 * anything else: charts order series by the row each first appears in, so
 * every view then gives a group the same place and color. Empty without a
 * breakout.
 */
export const breakoutOrderBy = (
  spec: AnalysisSpec,
  column = BREAKOUT_COLUMN,
): string[] => {
  const breakout = spec.breakout;
  switch (breakout?.type) {
    case undefined:
      return [];
    case "property":
      return [`${column} = ''`, column];
    case "segments":
      return [
        `indexOf([${breakout.groups.map(({ label }) => lit(label)).join(", ")}], ${column})`,
      ];
  }
};

/**
 * Keeps a drill's actors to the clicked group, when the point names one, as
 * a condition on an `actor` column. Empty otherwise.
 */
export const breakoutDrillCondition = (
  spec: AnalysisSpec,
  breakout: unknown,
): string =>
  spec.breakout !== undefined && typeof breakout === "string"
    ? ` AND actor IN (SELECT actor FROM ${ACTOR_BREAKOUTS_CTE} WHERE ${BREAKOUT_COLUMN} = ${lit(breakout)})`
    : "";
