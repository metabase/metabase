import type { DatabaseId } from "metabase-types/api/database";

export type XrayEntityType =
  | "table"
  | "segment"
  | "metric"
  | "model"
  | "question"
  | "adhoc"
  | "field"
  | "transform";

export interface GetXrayDashboardQueryMetadataRequest {
  entity: XrayEntityType;
  entityId: number | string;
  dashboard_load_id?: string;
}

export interface DatabaseXray {
  id: string;
  schema: string;
  tables: TableXray[];
}

export interface TableXray {
  title: string;
  url: string;
}

export interface DatabaseCandidateListQuery {
  id: DatabaseId;
}
