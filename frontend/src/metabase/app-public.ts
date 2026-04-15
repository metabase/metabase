import { setIsPublicEmbedding } from "metabase/embedding/config";
import api from "metabase/utils/api";

import { init } from "./app";
import { publicReducers } from "./reducers-public";
import { getRoutes } from "./routes-public";

setIsPublicEmbedding();

api.requestClient = "embedding-public";

init(publicReducers, getRoutes, () => {});
