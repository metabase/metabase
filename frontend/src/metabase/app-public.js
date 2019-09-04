import { init } from "./app";

import { getRoutes } from "./routes-public";
import reducers from "./reducers-public";

init(reducers, getRoutes, () => {});
