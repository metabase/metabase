import { push } from "react-router-redux";
import { t } from "ttag";

import { addUndo } from "metabase/redux/undo";
import { createThunkAction } from "metabase/utils/redux";

export const deletePermanently = createThunkAction(
  "metabase/archive/DELETE_PERMANENTLY",
  // pass in result of Entity.actions.delete(...)
  (entityDeleteAction: any) => async (dispatch) => {
    await dispatch(entityDeleteAction);
    dispatch(push("/trash"));
    dispatch(addUndo({ message: t`This item has been permanently deleted.` }));
  },
);
