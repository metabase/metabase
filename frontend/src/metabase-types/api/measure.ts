import type { DatasetQuery, OpaqueDatasetQuery } from "./query";
import type { ConcreteTableId, Table } from "./table";
import type { UserInfo } from "./user";

export type MeasureId = number;

export interface Measure {
  id: MeasureId;
  name: string;
  description: string | null;
  table_id: ConcreteTableId;
  table?: Table;
  archived: boolean;
  definition: OpaqueDatasetQuery;
  definition_description?: string;
  revision_message?: string;
  created_at: string;
  creator_id: number;
  creator?: UserInfo;
  updated_at: string;
}

export interface CreateMeasureRequest {
  name: string;
  table_id: ConcreteTableId;
  definition: DatasetQuery;
  description?: string;
}

export interface UpdateMeasureRequest {
  id: MeasureId;
  name?: string;
  definition?: DatasetQuery;
  revision_message: string;
  archived?: boolean;
  description?: string;
}
