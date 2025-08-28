import {
  PLUGIN_DOCUMENTS,
  PLUGIN_ENTITIES,
  PLUGIN_REDUCERS,
} from "metabase/plugins";
import Documents from "metabase-enterprise/entities/document";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { documentsReducer } from "./documents.slice";
import { getRoutes } from "./routes";
import { getCurrentDocument, getSidebarOpen } from "./selectors";
import { DocumentCopyForm } from "./components/DocumentCopyForm/DocumentCopyForm";

if (hasPremiumFeature("documents")) {
  PLUGIN_DOCUMENTS.getRoutes = getRoutes;
  PLUGIN_DOCUMENTS.shouldShowDocumentInNewItemMenu = () => true;
  PLUGIN_DOCUMENTS.getCurrentDocument = getCurrentDocument;
  PLUGIN_DOCUMENTS.getSidebarOpen = getSidebarOpen;
  PLUGIN_DOCUMENTS.DocumentCopyForm = DocumentCopyForm;

  PLUGIN_REDUCERS.documents = documentsReducer;

  PLUGIN_ENTITIES.entities["documents"] = Documents;
}
