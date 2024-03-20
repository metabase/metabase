import { DELETE, POST, GET } from "metabase/lib/api";

export const AuditApi = {
  unsubscribe_user: DELETE("/api/ee/audit-app/user/:id/subscriptions"),
};

export const AutoDescribeApi = {
  summarizeCard: POST("/api/ee/autodescribe/card/summarize"),
};

export const ImpersonationApi = {
  get: GET("/api/ee/advanced-permissions/impersonation"),
};
