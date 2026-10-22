import { c, t } from "ttag";

import { color } from "metabase/ui/colors";
import {
  getLightAccentColors,
  getMainAccentColors,
} from "metabase/ui/colors/groups";
import type {
  CardDisplayType,
  VisualizationSettings,
} from "metabase-types/api";
import { isRecord } from "metabase-types/guards";

import type { ExtraColumn } from "../columns";
import type { EventFlags } from "../events/types";
import { isPeopleSegmentRef } from "../segments/people-segment-ref";
import type { PeopleSegmentRef } from "../segments/types";
import type { BreakoutGroup, BreakoutSpec } from "../spec/types";
import {
  BREAKOUT_COLUMN,
  BREAKOUT_PROPERTY_COLUMN,
} from "../sql/analyses/breakout";

import type { AnalysisContext } from "./types";

/**
 * How an analysis splits its result: by a property's values, which don't
 * overlap, or by people segments, which can.
 */
export type Breakout =
  | {
      type: "property";
      /** A users table column when there is a users table, else an event table column. */
      column: string;
    }
  | { type: "cohorts"; segments: PeopleSegmentRef[] };

export const isBreakout = (value: unknown): value is Breakout =>
  isRecord(value) &&
  ((value.type === "property" && typeof value.column === "string") ||
    (value.type === "cohorts" &&
      Array.isArray(value.segments) &&
      value.segments.length > 0 &&
      value.segments.every(isPeopleSegmentRef)));

type BreakoutSpecOptions = {
  /**
   * Whether segment groups start with everyone. Leave it out where groups add
   * up, like a Sankey's flows into each node.
   */
  withEveryone?: boolean;
  /** Whether each segment has the people outside it beside it. */
  withOutside?: boolean;
};

/**
 * How the planners split the result, or undefined without a breakout. Cohorts
 * are each segment beside the people outside it, after everyone.
 */
export const getBreakoutSpec = (
  breakout: Breakout | null,
  events: EventFlags,
  { withEveryone = true, withOutside = true }: BreakoutSpecOptions = {},
): BreakoutSpec | undefined => {
  switch (breakout?.type) {
    case undefined:
      return undefined;
    case "property":
      return { type: "property" };
    case "cohorts":
      return {
        type: "segments",
        groups: [
          ...(withEveryone ? [{ label: getEveryoneLabel() }] : []),
          ...breakout.segments.flatMap((segment): BreakoutGroup[] => {
            const flag = events.segmentFlagFor(segment);
            const inside = {
              label: segment.label,
              segment: { flag, isMember: true },
            };
            const outside = {
              label: getOutsideLabel(segment.label),
              segment: { flag, isMember: false },
            };
            return withOutside ? [inside, outside] : [inside];
          }),
        ],
      };
  }
};

const getEveryoneLabel = () => t`Everyone`;

const getOutsideLabel = (label: string) =>
  c("{0} is the name of a group of people").t`Not in ${label}`;

/** The property's column on `events_base`, when breaking out by one. */
export const getBreakoutExtraColumns = (
  breakout: Breakout | null,
  context: AnalysisContext,
): ExtraColumn[] =>
  breakout?.type === "property"
    ? [
        {
          as: BREAKOUT_PROPERTY_COLUMN,
          column: breakout.column,
          from: context.usersTable !== undefined ? "users" : "events",
        },
      ]
    : [];

/**
 * A color per cohort group: everyone in gray, and each segment in an accent
 * beside the people outside it in that accent's lighter shade. Empty for a
 * property, whose values get the chart's own colors.
 */
export const getBreakoutColors = (
  breakout: Breakout | null,
): Record<string, string> => {
  if (breakout?.type !== "cohorts") {
    return {};
  }
  const accents = getMainAccentColors();
  const lightAccents = getLightAccentColors();
  return {
    [getEveryoneLabel()]: color("accent-gray-dark"),
    ...Object.fromEntries(
      breakout.segments.flatMap((segment, index) => [
        [segment.label, accents[index % accents.length]],
        [
          getOutsideLabel(segment.label),
          lightAccents[index % lightAccents.length],
        ],
      ]),
    ),
  };
};

/** The cartesian series settings that color each cohort group. */
export const getBreakoutSeriesSettings = (
  breakout: Breakout | null,
): Pick<VisualizationSettings, "series_settings"> => ({
  series_settings: Object.fromEntries(
    Object.entries(getBreakoutColors(breakout)).map(([label, value]) => [
      label,
      { color: value },
    ]),
  ),
});

/** The title of the setting that stacks a chart per group, or puts them side by side. */
export const getStackBreakoutsTitle = () => t`Stack breakouts`;

/**
 * Each group in a chart of its own, one above another. For a chart that would
 * otherwise draw one series, like a funnel's steps.
 */
export const getBreakoutChartsSettings = (
  display: CardDisplayType,
): Pick<
  VisualizationSettings,
  "small_multiples.display" | "small_multiples.column"
> => ({
  "small_multiples.display": display,
  "small_multiples.column": BREAKOUT_COLUMN,
});
