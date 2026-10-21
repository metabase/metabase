import { DocumentPageOuter } from "metabase/documents/routes";

import { useNotebookAnalysesAddon } from "../document/notebook-addon";

/** The document page, able to hold event analyses. */
export const NotebookPage = () => (
  <DocumentPageOuter useAddon={useNotebookAnalysesAddon} />
);
