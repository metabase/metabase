import type { CollectionId, DashboardId } from "metabase-types/api";

export interface AuditInfo {
  dashboard_overview: DashboardId;
  question_overview: DashboardId;
  custom_reports: CollectionId;
  model_overview: DashboardId;
}
