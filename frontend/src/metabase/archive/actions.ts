import { t } from "ttag";

import { createThunkAction } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { navigate } from "metabase/router";

export const deletePermanently = createThunkAction(
  "metabase/archive/DELETE_PERMANENTLY",
  // pass in result of Entity.actions.delete(...)
  (entityDeleteAction: any) => async (dispatch) => {
    await dispatch(entityDeleteAction);
    navigate("/trash");
    dispatch(addUndo({ message: t`This item has been permanently deleted.` }));
  },
);
