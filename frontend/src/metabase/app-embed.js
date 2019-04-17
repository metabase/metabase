/*
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE-EMBEDDING.txt', which is part of this source code package.
 */

import { init } from "./app";

import { getRoutes } from "./routes-embed.jsx";
import reducers from "./reducers-public";

import { IFRAMED } from "metabase/lib/dom";

import moment from "moment";
moment.locale("tr");

init(reducers, getRoutes, () => {
  if (IFRAMED) {
    document.body.style.backgroundColor = "transparent";
  }
});
