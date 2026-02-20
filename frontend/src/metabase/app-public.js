import { setIsPublicEmbedding } from "metabase/embedding/config";

import { init } from "./app";
import { publicReducers } from "./reducers-public";
import { getPublicRouteObjects } from "./routes-public";

setIsPublicEmbedding();

init(publicReducers, getPublicRouteObjects, () => {});
