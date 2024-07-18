import api from "metabase/lib/api";

import { init } from "./app";
import { publicReducers } from "./reducers-public";
import { getRoutes } from "./routes-public";

init(publicReducers, getRoutes, () => {
  api.requestClient = "embedding-public";
});
