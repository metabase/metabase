import type {
  Card,
  CardId,
  DatasetData,
  MeasureId,
  ReferencedEntityType,
} from "metabase-types/api";

export type GoalData = Pick<
  DatasetData,
  "cols" | "rows" | "referenced_entities"
>;

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

export type GoalRefErrorReason =
  | "query-failed"
  | "column-not-found"
  | "not-a-number";

export type GoalRefError =
  | {
      type?: Extract<ReferencedEntityType, "card">;
      id?: CardId;
      column: string;
      reason: GoalRefErrorReason;
      message?: string;
    }
  | {
      type?: Extract<ReferencedEntityType, "measure">;
      id?: MeasureId;
      column: string;
      reason: GoalRefErrorReason;
      message?: string;
    };

export type GoalValueResult = {
  value: number | null;
  error?: GoalRefError;
  isUnanswered?: boolean;
};

export type GoalCard = {
  display: Card["display"];
  visualization_settings?: Card["visualization_settings"];
};
