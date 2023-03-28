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
  entityId?: MetabotEntityId;
  entityType: MetabotEntityType;
  card?: Card;
  originalCard?: Card;
  queryText?: string;
  queryStatus: MetabotQueryStatus;
  queryResults?: [Dataset];
  queryError?: unknown;
  feedbackType?: MetabotFeedbackType;
  feedbackStatus: MetabotFeedbackStatus;
}
