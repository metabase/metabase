import { setIsPublicEmbed } from "metabase/embedding/config";

import { init } from "./app";
import { publicReducers } from "./reducers-public";
import { getRoutes } from "./routes-public";

setIsPublicEmbed();

init(publicReducers, getRoutes, () => {});
