import { DELETE, POST, GET } from "metabase/lib/api";

export const AuditApi = {
  unsubscribe_user: DELETE("/api/ee/audit-app/user/:id/subscriptions"),
  getAuditInfo: GET("/api/ee/audit-app/user/audit-info"),
};

export const AutoDescribeApi = {
  summarizeCard: POST("/api/ee/auto-describe/summarize-card"),
};

export const ImpersonationApi = {
  get: GET("/api/ee/advanced-permissions/impersonation"),
};
