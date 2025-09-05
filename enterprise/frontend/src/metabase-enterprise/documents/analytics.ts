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
