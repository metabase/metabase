import { push } from "react-router-redux";

import type { Dispatch } from "metabase-types/store";

export const navigateBackToDocument =
  (documentId: number) => (dispatch: Dispatch) => {
    dispatch(push(`/document/${documentId}`));
  };
