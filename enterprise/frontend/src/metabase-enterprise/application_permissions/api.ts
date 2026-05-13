import { GET, PUT } from "metabase/api/legacy-client";

export const ApplicationPermissionsApi = {
  graph: GET("/api/ee/advanced-permissions/application/graph"),
  updateGraph: PUT("/api/ee/advanced-permissions/application/graph"),
};
