import { PLUGIN_REPORTS } from "metabase/plugins";

import "./reducer";
import { getRoutes } from "./routes";

PLUGIN_REPORTS.getRoutes = getRoutes;
PLUGIN_REPORTS.shouldShowReportInNewItemMenu = () => true;
