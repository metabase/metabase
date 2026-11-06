import type { ConcreteTableId } from "./table";

export type AnalysisKind = "habit";

export type AnalysisDateRange =
  | {
      type: "relative";
      value: number;
      unit: "day" | "week" | "month" | "quarter" | "year";
    }
  | { type: "absolute"; start: string; end: string };

/** MBQL filter clauses, which the backend validates. */
export type AnalysisFilter = unknown[];

export type AnalysisEvent = {
  name: string;
  filters: AnalysisFilter[];
};

export type AnalysisGrain = "person" | "session";
export type AnalysisSubPeriod = "day" | "week";

export type HabitSettings = {
  date_range: AnalysisDateRange;
  grain: AnalysisGrain;
  sub_period: AnalysisSubPeriod;
  active: AnalysisEvent | null;
  filters: AnalysisFilter[];
};

export type AnalysisColumns = {
  timestamp: string;
  person: string;
  session: string | null;
};

/** The `analysis` key of a query: the form its stages were built from. */
export type Analysis = {
  version: 1;
  compiler_version: number;
  kind: AnalysisKind;
  columns: AnalysisColumns;
  settings: HabitSettings;
};

/**
 * What to build. A saved analysis names its columns; a new one takes the ones
 * its event table suggests.
 */
export type AnalysisInput = {
  table_id: ConcreteTableId;
  kind: AnalysisKind;
  columns?: AnalysisColumns;
  settings: Partial<HabitSettings>;
};
