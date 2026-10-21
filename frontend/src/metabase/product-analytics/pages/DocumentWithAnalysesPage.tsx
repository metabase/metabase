import { DocumentPageOuter } from "metabase/documents/routes";

import { useDocumentAnalysesAddon } from "../document/document-analyses-addon";

/** The document page, able to hold event analyses. */
export const DocumentWithAnalysesPage = () => (
  <DocumentPageOuter useAddon={useDocumentAnalysesAddon} />
);
