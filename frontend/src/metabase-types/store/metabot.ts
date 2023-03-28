import { Card, CardId, DatabaseId, Dataset } from "metabase-types/api";

export type MetabotEntityId = CardId | DatabaseId;
export type MetabotEntityType = "database" | "model";
export type MetabotQueryStatus = "idle" | "running" | "complete";

export interface MetabotState {
  entityId: MetabotEntityId;
  entityType: MetabotEntityType;
  card?: Card;
  queryStatus: MetabotQueryStatus;
  queryResults?: [Dataset];
  queryError?: unknown;
}
