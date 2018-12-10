import { init } from "./app";

import { getRoutes } from "./routes-public.jsx";
import reducers from "./reducers-public";

import moment from "moment";
moment.locale("tr");

init(reducers, getRoutes, () => {});
