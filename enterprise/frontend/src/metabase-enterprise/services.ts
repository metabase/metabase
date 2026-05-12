import { DELETE, GET } from "metabase/api/legacy-client";

export const AuditApi = {
  unsubscribe_user: DELETE("/api/ee/audit-app/user/:id/subscriptions"),
};

export const ImpersonationApi = {
  get: GET("/api/ee/advanced-permissions/impersonation"),
};
