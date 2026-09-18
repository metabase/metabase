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

/**
 * The `diagnosticInfo` body of `POST /api/slack/bug-report`: an `ErrorPayload` whose `reporter` is a
 * boolean saying whether to attribute the report to the current user. The identity itself is never
 * sent — the backend derives it from the session.
 */
export type DiagnosticInfoPayload = Omit<ErrorPayload, "reporter"> & {
  reporter: boolean;
};
