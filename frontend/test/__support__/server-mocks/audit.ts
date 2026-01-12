import fetchMock, { type UserRouteConfig } from "fetch-mock";

import type {
  CardId,
  CollectionId,
  DashboardId,
  User,
} from "metabase-types/api";

interface AuditInfo {
  dashboard_overview: DashboardId;
  question_overview: CardId;
  custom_reports: CollectionId;
}

export const defaultAuditInfo: AuditInfo = {
  dashboard_overview: 201,
  question_overview: 202,
  custom_reports: 203,
};

export const setupAuditInfoEndpoint = ({
  auditInfo = defaultAuditInfo,
}: {
  auditInfo?: AuditInfo;
} = {}) => {
  fetchMock.get("path:/api/ee/audit-app/user/audit-info", auditInfo);
};

export const setupAuditUnsubscribeEndpoint = (
  userId: User["id"],
  response?: UserRouteConfig,
) => {
  fetchMock.delete(
    `path:/api/ee/audit-app/user/${userId}/subscriptions`,
    response ?? 200,
  );
};
