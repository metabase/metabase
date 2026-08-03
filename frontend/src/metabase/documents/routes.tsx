import { useParams } from "metabase/router";
import { extractEntityId } from "metabase/urls";

import { DocumentPage } from "./components/DocumentPage";

export const DocumentPageOuter = () => {
  const { entityId } = useParams();
  const documentId = entityId === "new" ? "new" : extractEntityId(entityId);

  // Remounts DocumentPage when navigating to a different document.
  // Prevents data, state, undo history, etc from bleeding between documents.
  return <DocumentPage key={documentId} />;
};
