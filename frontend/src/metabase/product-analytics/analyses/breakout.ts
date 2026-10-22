import { isRecord } from "metabase-types/guards";

import { isPeopleSegmentRef } from "../segments/people-segment-ref";
import type { PeopleSegmentRef } from "../segments/types";

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
