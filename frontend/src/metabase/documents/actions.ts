import { push } from "react-router-redux";

import { NAVIGATE_TO_NEW_CARD } from "metabase/dashboard/actions";
import { openUrl } from "metabase/redux/app";
import type { Document } from "metabase-types/api";
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

    dispatch(openUrl(url));
  };
