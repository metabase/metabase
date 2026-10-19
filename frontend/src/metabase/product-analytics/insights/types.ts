import type { ExtraColumn } from "../columns";

/** A table column the search splits people by. */
export type InsightAttribute = Omit<ExtraColumn, "as"> & {
  /** The column's name on `events_base`. */
  id: string;
  displayName: string;
};

export type InsightCondition = {
  attributeId: string;
  value: string;
};

export type Counts = {
  reached: number;
  converted: number;
};

/** Counts for the people who meet `conditions` at one transition. No conditions means everyone. */
export type GroupCounts = Counts & {
  /** Step k → step k+1, numbered from 1. */
  transition: number;
  conditions: InsightCondition[];
};

export type Insight = GroupCounts & {
  rate: number;
  /** The conversion rate of everyone else at the transition. */
  restRate: number;
  /** Conversions above (or, when negative, below) what the group would have at everyone else's rate. */
  excess: number;
  pValue: number;
};
