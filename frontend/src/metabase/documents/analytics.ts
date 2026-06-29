import { trackSimpleEvent } from "metabase/analytics";
import type { Document, DocumentId } from "metabase-types/api";

export type DocumentTriggerSource = "standalone" | "exploration";

export const trackDocumentCreated = (
  documentId: DocumentId,
  triggeredFrom: DocumentTriggerSource,
) => {
  trackSimpleEvent({
    event: "document_created",
    target_id: documentId,
    triggered_from: triggeredFrom,
  });
};

export const trackDocumentUpdated = (
  documentId: DocumentId,
  triggeredFrom: DocumentTriggerSource,
) => {
  trackSimpleEvent({
    event: "document_saved",
    target_id: documentId,
    triggered_from: triggeredFrom,
  });
};

export const trackDocumentAddCard = (document?: Document | null) => {
  trackSimpleEvent({
    event: "document_add_card",
    target_id: document?.id || null,
  });
};

export const trackDocumentAddSmartLink = (document?: Document | null) => {
  trackSimpleEvent({
    event: "document_add_smart_link",
    target_id: document?.id || null,
  });
};

export const trackDocumentReplaceCard = (document?: Document | null) => {
  trackSimpleEvent({
    event: "document_replace_card",
    target_id: document?.id || null,
  });
};

export const trackDocumentDuplicated = (document?: Document | null) => {
  trackSimpleEvent({
    event: "document_duplicated",
    target_id: document?.id || null,
  });
};

export const trackDocumentAskMetabot = (document?: Document | null) => {
  trackSimpleEvent({
    event: "document_ask_metabot",
    target_id: document?.id || null,
  });
};

export const trackDocumentPrint = (document?: Document | null) => {
  trackSimpleEvent({
    event: "document_print",
    target_id: document?.id || null,
  });
};

export const trackDocumentBookmark = () => {
  trackSimpleEvent({
    event: "bookmark_added",
    event_detail: "document",
    triggered_from: "document_header",
  });
};

export const trackDocumentAddSupportingText = (document?: Document | null) => {
  trackSimpleEvent({
    event: "document_add_supporting_text",
    target_id: document?.id || null,
  });
};

export const trackDocumentUnsavedChangesWarningDisplayed = (
  document?: Document | null,
) => {
  trackSimpleEvent({
    event: "unsaved_changes_warning_displayed",
    target_id: document?.id || null,
    triggered_from: "document",
  });
};
