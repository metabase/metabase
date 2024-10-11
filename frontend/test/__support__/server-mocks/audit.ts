import fetchMock from "fetch-mock";

import type { CardId, CollectionId, DashboardId } from "metabase-types/api";

interface AuditInfo {
  dashboard_overview: DashboardId;
  question_overview: CardId;
  custom_reports: CollectionId;
}

const defaultAuditInfo: AuditInfo = {
  dashboard_overview: 201,
  question_overview: 202,
  custom_reports: 203,
};

export const setupAuditEndpoints = ({
  auditInfo = defaultAuditInfo,
}: {
  auditInfo?: AuditInfo;
} = {}) => {
  fetchMock.get("path:/api/ee/audit-app/user/audit-info", auditInfo);
};
