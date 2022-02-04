import { DELETE } from "metabase/lib/api";

export const AuditApi = {
  unsubscribe_user: DELETE("/api/ee/audit-app/user/:id/subscriptions"),
};
