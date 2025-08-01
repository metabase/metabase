import { PLUGIN_DOCUMENTS } from "metabase/plugins";

import "./reducer";
import { getRoutes } from "./routes";

PLUGIN_DOCUMENTS.getRoutes = getRoutes;
PLUGIN_DOCUMENTS.shouldShowDocumentInNewItemMenu = () => true;
