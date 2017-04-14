/* @flow */

import { init } from "./app";

import { getRoutes } from "./routes.jsx";
import reducers from './reducers-main';
import rootEpic from './epics-main';

init(reducers, rootEpic, getRoutes, () => {
})
