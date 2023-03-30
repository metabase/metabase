import {
  Card,
  CardId,
  DatabaseId,
  Dataset,
  MetabotFeedbackType,
} from "metabase-types/api";
import { Deferred } from "metabase/lib/promise";

export type MetabotEntityId = CardId | DatabaseId;
export type MetabotEntityType = "database" | "model";
export type MetabotQueryStatus = "idle" | "running" | "complete";

export interface MetabotState {
  entityId: MetabotEntityId | null;
  entityType: MetabotEntityType | null;
  card: Card | null;
  promptTemplateVersions: string[] | null;
  prompt: string;
  queryStatus: MetabotQueryStatus;
  queryResults: [Dataset] | null;
  queryError: unknown;
  feedbackType: MetabotFeedbackType | null;
  cancelQueryDeferred: Deferred<unknown>;
}
