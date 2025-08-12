import { PLUGIN_DOCUMENTS } from "metabase/plugins";

import "./reducer";
import { DocumentBackButton } from "./components/DocumentBackButton";
import { getRoutes } from "./routes";
import { getCurrentDocument } from "./selectors";

PLUGIN_DOCUMENTS.getRoutes = getRoutes;
PLUGIN_DOCUMENTS.shouldShowDocumentInNewItemMenu = () => true;
PLUGIN_DOCUMENTS.DocumentBackButton = DocumentBackButton;
PLUGIN_DOCUMENTS.getCurrentDocument = getCurrentDocument;
