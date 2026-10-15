import { trackSimpleEvent } from "metabase/analytics";
import type { DocumentId } from "metabase-types/api";

export function trackDataStudioDocumentCreated(documentId: DocumentId) {
  trackSimpleEvent({
    event: "data_studio_document_created",
    target_id: documentId,
  });
}
