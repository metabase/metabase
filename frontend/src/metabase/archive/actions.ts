import { t } from "ttag";

import { pushPath } from "metabase/lib/navigation";
import { createThunkAction } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";

export const deletePermanently = createThunkAction(
  "metabase/archive/DELETE_PERMANENTLY",
  // pass in result of Entity.actions.delete(...)
  (entityDeleteAction: any) => async (dispatch) => {
    await dispatch(entityDeleteAction);
    pushPath("/trash");
    dispatch(addUndo({ message: t`This item has been permanently deleted.` }));
  },
);
