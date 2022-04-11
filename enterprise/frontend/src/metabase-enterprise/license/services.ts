import { GET } from "metabase/lib/api";

export const StoreApi = {
  tokenStatus: GET("/api/premium-features/token/status"),
};
