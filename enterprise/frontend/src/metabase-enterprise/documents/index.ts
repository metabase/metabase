import {
  PLUGIN_DOCUMENTS,
  PLUGIN_ENTITIES,
  PLUGIN_REDUCERS,
} from "metabase/plugins";
import Documents from "metabase-enterprise/entities/document";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { DocumentBackButton } from "./components/DocumentBackButton";
import { documentsReducer } from "./documents.slice";
import { getRoutes } from "./routes";
import { getCurrentDocument } from "./selectors";

if (hasPremiumFeature("documents")) {
  PLUGIN_DOCUMENTS.getRoutes = getRoutes;
  PLUGIN_DOCUMENTS.shouldShowDocumentInNewItemMenu = () => true;
  PLUGIN_DOCUMENTS.DocumentBackButton = DocumentBackButton;
  PLUGIN_DOCUMENTS.getCurrentDocument = getCurrentDocument;

  PLUGIN_REDUCERS.documents = documentsReducer;

  PLUGIN_ENTITIES.entities["documents"] = Documents;
}
