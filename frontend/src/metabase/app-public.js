import { init } from "./app";

import { getRoutes } from "./routes-public.jsx";
import reducers from './reducers-public';
import rootEpic from './epics-public';

init(reducers, rootEpic, getRoutes, () => {
})
