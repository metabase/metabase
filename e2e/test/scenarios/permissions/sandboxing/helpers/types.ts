import type { Dataset } from "metabase-types/api";

export type DatasetResponse = {
  body: Dataset;
  url: string;
  headers: any;
  statusCode: number;
};

export type DashcardQueryResponse = {
  body: Dataset;
  url: string;
  headers: any;
  statusCode: number;
};
