import type {
  Card,
  Collection,
  Dashboard,
  DatasetData,
  Log,
  MetabaseInfo,
} from "metabase-types/api";

export type ReportableEntityName =
  | "question"
  | "model"
  | "dashboard"
  | "metric"
  | "collection";

export type ErrorPayload = Partial<{
  url: string;
  description: string;
  reporter: {
    name: string;
    email: string;
  };
  frontendErrors: string[];
  backendErrors: Log[];
  userLogs: Log[];
  logs: Log[];
  entityName: ReportableEntityName;
  localizedEntityName: string;
  entityInfo: Card | Dashboard | Collection;
  queryResults: DatasetData;
  bugReportDetails: MetabaseInfo;
}>;
