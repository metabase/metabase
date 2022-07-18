import { DatabaseId } from "./database";
import { TableId } from "./table";

export interface StructuredQuery {
  "source-table"?: TableId;
}

export interface NativeQuery {
  query: string;
}

export interface StructuredDatasetQuery {
  type: "query";
  database: DatabaseId;
  query: StructuredQuery;
}

export interface NativeDatasetQuery {
  type: "native";
  database: DatabaseId;
  query: NativeQuery;
}

export type DatasetQuery = StructuredDatasetQuery | NativeDatasetQuery;
