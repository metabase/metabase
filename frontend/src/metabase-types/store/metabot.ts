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

export interface MetabotState {
  entityId: MetabotEntityId | null;
  entityType: MetabotEntityType | null;
  card: Card | null;
  originalCard: Card | null;
  prompt: string;
  queryStatus: MetabotQueryStatus;
  queryResults: [Dataset] | null;
  queryError: unknown;
  feedbackType: MetabotFeedbackType | null;
}
