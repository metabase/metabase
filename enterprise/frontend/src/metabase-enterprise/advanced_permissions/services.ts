import { GET } from "metabase/utils/api";

export const ImpersonationApi = {
  get: GET("/api/ee/advanced-permissions/impersonation"),
};
