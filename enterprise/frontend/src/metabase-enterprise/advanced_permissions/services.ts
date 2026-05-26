import { GET } from "metabase/api/legacy-client";

export const ImpersonationApi = {
  get: GET("/api/ee/advanced-permissions/impersonation"),
};
