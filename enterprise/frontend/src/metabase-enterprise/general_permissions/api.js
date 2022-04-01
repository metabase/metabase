import _ from "underscore";

import { GET, PUT } from "metabase/lib/api";

export const GeneralPermissionsApi = {
  graph: GET("/api/ee/advanced-permissions/general/graph"),
  updateGraph: PUT("api/ee/advanced-permissions/general/graph"),
};
