import { t } from "ttag";

import { createThunkAction } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { routerActions } from "metabase/routing/compat/react-router-redux";

export const deletePermanently = createThunkAction(
  "metabase/archive/DELETE_PERMANENTLY",
  // pass in result of Entity.actions.delete(...)
  (entityDeleteAction: any) => async (dispatch) => {
    await dispatch(entityDeleteAction);
    dispatch(routerActions.push("/trash"));
    dispatch(addUndo({ message: t`This item has been permanently deleted.` }));
  },
);
