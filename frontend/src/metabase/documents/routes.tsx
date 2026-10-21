import { useRef } from "react";

import { useLocation, useParams } from "metabase/router";
import { extractEntityId } from "metabase/urls";

import { DocumentPage } from "./components/DocumentPage";
import type {
  DocumentPageAddon,
  UseDocumentPageAddon,
} from "./components/document-page-addon";
import { CREATED_FROM_NEW_STATE } from "./hooks/use-document-editor";

export type { DocumentPageAddon, UseDocumentPageAddon };

export const DocumentPageOuter = ({
  useAddon,
}: {
  useAddon?: UseDocumentPageAddon;
}) => {
  const { entityId } = useParams();
  const location = useLocation();
  const documentId = entityId === "new" ? "new" : extractEntityId(entityId);

  // Remounts DocumentPage when navigating to a different document.
  // Prevents data, state, undo history, etc from bleeding between documents.
  // A new document that auto-save just created keeps its page, so the editor
  // doesn't reload under the person typing in it.
  const pageKeyRef = useRef(documentId);
  const isCreatedFromNew =
    pageKeyRef.current === "new" &&
    location.state?.isCreatedFromNew ===
      CREATED_FROM_NEW_STATE.isCreatedFromNew;
  if (documentId !== pageKeyRef.current && !isCreatedFromNew) {
    pageKeyRef.current = documentId;
  }
  return <DocumentPage key={String(pageKeyRef.current)} useAddon={useAddon} />;
};
