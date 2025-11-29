import type { ComponentProps } from "react";

import { extractEntityId } from "metabase/lib/urls";

import { DocumentPage } from "./components/DocumentPage";

export const DocumentPageOuter = (
  props: ComponentProps<typeof DocumentPage>,
) => {
  const { entityId } = props.params;
  const documentId = entityId === "new" ? "new" : extractEntityId(entityId);

  // Remounts DocumentPage when navigating to a different document.
  // Prevents data, state, undo history, etc from bleeding between documents.
  return <DocumentPage key={documentId} {...props} />;
};
