import { GET } from "metabase/lib/api";

export const StoreApi = {
  tokenStatus: GET("/api/metastore/token/status"),
};
