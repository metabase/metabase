import {
  Card,
  CardId,
  DatabaseId,
  Dataset,
  MetabotFeedbackType,
} from "metabase-types/api";

export type MetabotEntityId = CardId | DatabaseId;
export type MetabotEntityType = "database" | "model";
export type MetabotQueryStatus = "idle" | "running" | "complete";
export type MetabotFeedbackStatus = "idle" | "complete";

export interface MetabotState {
  entityId: MetabotEntityId | null;
  entityType: MetabotEntityType | null;
  card: Card | null;
  originalCard: Card | null;
  queryText: string;
  queryStatus: MetabotQueryStatus;
  queryResults: [Dataset] | null;
  queryError: unknown;
  feedbackType: MetabotFeedbackType | null;
  feedbackStatus: MetabotFeedbackStatus;
}
