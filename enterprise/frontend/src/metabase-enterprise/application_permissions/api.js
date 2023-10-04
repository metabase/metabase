import { GET, PUT } from "metabase/lib/api";

export const ApplicationPermissionsApi = {
  graph: GET("/api/ee/advanced-permissions/application/graph"),
  updateGraph: PUT("/api/ee/advanced-permissions/application/graph"),
};
