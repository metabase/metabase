/*
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE-EMBEDDING.txt', which is part of this source code package.
 */

import { isWithinIframe } from "metabase/lib/dom";

import { init } from "./app";
import { publicReducers } from "./reducers-public";
import { getRoutes } from "./routes-embed";

init(publicReducers, getRoutes, () => {
  if (isWithinIframe()) {
    document.body.style.backgroundColor = "transparent";
  }
});
