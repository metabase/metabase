import { push } from "react-router-redux";
import { t } from "ttag";

import { TRASH_COLLECTION } from "metabase/entities/collections";
import { createThunkAction } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { addUndo } from "metabase/redux/undo";

export const deletePermanently = createThunkAction(
  "metabase/archive/DELETE_PERMANENTLY",
  // pass in result of Entity.actions.delete(...)
  (entityDeleteAction: any) => async dispatch => {
    await dispatch(entityDeleteAction);
    dispatch(push(Urls.collection(TRASH_COLLECTION)));
    dispatch(addUndo({ message: t`This item has been permanently deleted.` }));
  },
);
