/*
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE-EMBEDDING.txt', which is part of this source code package.
 */

import { init } from "./app";

import { getRoutes } from "./routes-embed";
import reducers from "./reducers-public";

import { IFRAMED } from "metabase/lib/dom";

init(reducers, getRoutes, () => {
  if (IFRAMED) {
    document.body.style.backgroundColor = "transparent";
  }
});
