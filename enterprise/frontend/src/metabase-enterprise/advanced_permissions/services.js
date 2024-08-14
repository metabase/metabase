import { GET } from "metabase/lib/api";

export const ImpersonationApi = {
  get: GET("/api/ee/advanced-permissions/impersonation"),
};
