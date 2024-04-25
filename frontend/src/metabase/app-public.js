import { init } from "./app";
import reducers from "./reducers-public";
import { getRoutes } from "./routes-public";

init(reducers, getRoutes, () => {});
