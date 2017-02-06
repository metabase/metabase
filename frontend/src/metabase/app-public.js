import { init } from "./app";

import { getRoutes } from "./routes-public.jsx";
import reducers from './reducers-public';

import { IFRAMED } from "metabase/lib/dom";

init(reducers, getRoutes, () => {
    if (IFRAMED) {
        document.body.style.backgroundColor = "transparent";
    }
})
