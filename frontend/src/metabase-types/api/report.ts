import type { CollectionId } from "./collection";

export type ReportId = number;

export type Report = {
  id: ReportId;
  document: string;
  name: string;
  version: number;
  collection_id: CollectionId;
  created_at: string;
  updated_at: string;
};

export type ReportVersions = Report[];

export type CreateReportRequest = Pick<Report, "name" | "document"> & {
  collection_id?: CollectionId;
};
