/*
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE-EMBEDDING.txt', which is part of this source code package.
 */

import { setIsStaticEmbedding } from "metabase/embedding/config";
import api from "metabase/utils/api";
import { IFRAMED_IN_SELF } from "metabase/utils/iframe";

import { init } from "./app";
import { publicReducers } from "./reducers-public";
import { getRoutes } from "./routes-embed";

setIsStaticEmbedding();

/**
 * We counted static embed preview query executions which led to wrong embedding stats (EMB-930)
 * This header is only used for analytics and for checking if we want to disable some features in the
 * embedding iframe (only for Documents at the time of this comment)
 */
if (!IFRAMED_IN_SELF) {
  api.requestClient = "embedding-iframe-static";
}

init(publicReducers, getRoutes, () => {});
