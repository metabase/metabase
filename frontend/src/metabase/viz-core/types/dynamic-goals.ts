import type {
  Card,
  CardId,
  CardType,
  DatasetData,
  MeasureId,
} from "metabase-types/api";

export type GoalData = Pick<DatasetData, "cols" | "rows">;

// A bound left empty stays null; at most one bound is null.
export type ResolvedOpenEndedGoalSegment = {
  color: string;
  label?: string;
  min: number | null;
  max: number | null;
};

export type ResolvedGoalSegment = ResolvedOpenEndedGoalSegment & {
  min: number;
  max: number;
};

// Ideally should exclude "model" from CardType, but it would require type casting in multiple places
export type GoalSourceKind = CardType | "measure";

export type GoalRefErrorReason =
  | "query-failed"
  | "source-not-found"
  | "too-many-rows"
  | "has-parameters"
  | "column-not-found"
  | "not-a-number";

export type GoalRefError =
  | {
      type?: "card";
      id?: CardId;
      column: string;
      reason: GoalRefErrorReason;
      message?: string;
    }
  | {
      type?: "measure";
      id?: MeasureId;
      column: string;
      reason: GoalRefErrorReason;
      message?: string;
    };

export type GoalValueResult = {
  value: number | null;
  error?: GoalRefError;
  isLoading?: boolean;
};

export type GoalCard = {
  display: Card["display"];
  visualization_settings?: Card["visualization_settings"];
};
