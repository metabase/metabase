import { push } from "react-router-redux";

import { revisionApi } from "metabase/api";
import { documentApi } from "metabase/api/document";
import { NAVIGATE_TO_NEW_CARD } from "metabase/dashboard/actions";
import { entityCompatibleQuery } from "metabase/lib/entities";
import { createThunkAction } from "metabase/lib/redux";
import type { Document, Revision } from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

export const navigateBackToDocument =
  (documentId: number) => (dispatch: Dispatch) => {
    dispatch(push(`/document/${documentId}`));
  };

export const navigateToCardFromDocument =
  (url: string, document?: Document | null) => (dispatch: Dispatch) => {
    if (document) {
      dispatch({
        type: NAVIGATE_TO_NEW_CARD,
        payload: {
          model: "document",
          id: document.id,
          name: document.name,
        },
      });
    }

    dispatch(push(url));
  };

export const fetchDocument = (documentId: number) => (dispatch: Dispatch) =>
  entityCompatibleQuery(
    { id: documentId, entity: "document" },
    dispatch,
    documentApi.endpoints.getDocument,
    { forceRefetch: true },
  );

export const REVERT_TO_REVISION = "metabase/document/REVERT_TO_REVISION";
export const revertToRevision = createThunkAction(
  REVERT_TO_REVISION,
  (documentId: number, revision: Revision) => {
    return async (dispatch) => {
      await entityCompatibleQuery(
        {
          id: documentId,
          entity: "document",
          revision_id: revision.id,
        },
        dispatch,
        revisionApi.endpoints.revertRevision,
      );
      await dispatch(fetchDocument(documentId));
    };
  },
);
