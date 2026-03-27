import { trackSimpleEvent } from "metabase/lib/analytics";
import type { Document } from "metabase-types/api";

export const trackDocumentCreated = (document: Document) => {
  trackSimpleEvent({
    event: "document_created",
    target_id: document.id,
  });
};

export const trackDocumentUpdated = (document: Document) => {
  trackSimpleEvent({
    event: "document_saved",
    target_id: document.id,
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
