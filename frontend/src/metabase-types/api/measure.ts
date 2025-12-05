import type { DatasetQuery } from "./query";
import type { Table, TableId } from "./table";

export type MeasureId = number;

export interface Measure {
  id: MeasureId;
  name: string;
  description: string;
  table_id: TableId;
  table?: Table;
  archived: boolean;
  definition: DatasetQuery;
  definition_description: string;
  revision_message?: string;
}

export interface CreateMeasureRequest {
  name: string;
  table_id: TableId;
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

export interface DeleteMeasureRequest {
  id: MeasureId;
  revision_message: string;
}
