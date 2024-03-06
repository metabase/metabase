import type {
  Log,
  Card,
  Dashboard,
  Collection,
  DatasetData,
  MetabaseInfo,
} from "metabase-types/api";

export type ReportableEntityName =
  | "question"
  | "model"
  | "dashboard"
  | "collection";

export type ErrorPayload = Partial<{
  url: string;
  frontendErrors: string[];
  backendErrors: Log[];
  userLogs: Log[];
  logs: Log[];
  entityName: ReportableEntityName;
  entityInfo: Card | Dashboard | Collection;
  queryData: DatasetData;
  instanceInfo: {
    bugReportDetails: MetabaseInfo;
    sessionProperties: any;
  };
}>;
