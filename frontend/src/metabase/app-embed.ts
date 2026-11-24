/*
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE-EMBEDDING.txt', which is part of this source code package.
 */

import { setIsStaticEmbedding } from "metabase/embedding/config";
import { isContentPath } from "metabase/embedding/permission-preview/item";

import { init } from "./app";
import { publicReducers } from "./reducers-public";
import { getRoutes } from "./routes-embed";

if (isContentPath(window.location.pathname)) {
  import("./embedding/permission-preview-frame/start-frame").then(
    ({ startFrame }) => startFrame(),
  );
} else {
  setIsStaticEmbedding();

  init(publicReducers, getRoutes, () => {});
}
