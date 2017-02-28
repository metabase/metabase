import { init } from "./app";

import { getRoutes } from "./routes.jsx";
import reducers from './reducers-main';

init(reducers, getRoutes, () => {
})
