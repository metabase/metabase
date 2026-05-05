import { GET, PUT } from "metabase/utils/api";

export const ApplicationPermissionsApi = {
  graph: GET("/api/ee/advanced-permissions/application/graph"),
  updateGraph: PUT("/api/ee/advanced-permissions/application/graph"),
};
