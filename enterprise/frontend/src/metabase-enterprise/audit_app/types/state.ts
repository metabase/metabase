import type { CardId, CollectionId, DashboardId } from "metabase-types/api";

export interface AuditInfo {
  dashboard_overview: DashboardId;
  question_overview: CardId;
  custom_reports: CollectionId;
}
