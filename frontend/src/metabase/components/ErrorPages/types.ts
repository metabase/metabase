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
  | "metric"
  | "dashboard"
  | "collection";

export type ErrorPayload = {
  url: string;
  frontendErrors?: string[];
  backendErrors?: Log[];
  userLogs?: Log[];
  logs?: Log[];
  entityName?: ReportableEntityName;
  localizedEntityName?: string;
  entityInfo: Card | Dashboard | Collection;
  queryResults: DatasetData;
  bugReportDetails: MetabaseInfo;
  browserInfo: {
    userAgent: string;
    language: string;
    browserName: string;
    browserVersion: string;
    platform: string;
    os: string;
    osVersion: string;
  };
};
