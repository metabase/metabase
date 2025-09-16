import type { ComponentProps } from "react";

import { ModalRoute } from "metabase/hoc/ModalRoute";
import { Route } from "metabase/hoc/Title";
import { extractEntityId } from "metabase/lib/urls";

import { CommentsSidesheet } from "./components/CommentsSidesheet";
import { DocumentPage } from "./components/DocumentPage";

const DocumentPageOuter = (props: ComponentProps<typeof DocumentPage>) => {
  const { entityId } = props.params;
  const documentId = entityId === "new" ? "new" : extractEntityId(entityId);

  // Remounts DocumentPage when navigating to a different document.
  // Prevents data, state, undo history, etc from bleeding between documents.
  return <DocumentPage key={documentId} {...props} />;
};

export const getRoutes = () => (
  <Route path="document/:entityId" component={DocumentPageOuter}>
    <ModalRoute
      path="comments/:childTargetId"
      modal={CommentsSidesheet}
      noWrap
      modalProps={{
        enableTransition: false,
        closeOnClickOutside: false,
      }}
    />
  </Route>
);
