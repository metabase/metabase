import { init } from "./app";

import { getRoutes } from "./routes-public.jsx";
import reducers from "./reducers-public";

init(reducers, getRoutes, () => {});
