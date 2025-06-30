import { createThunkAction } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { UserApi } from "metabase/services";

export const CLOSE_QB_NEWB_MODAL = "metabase/qb/CLOSE_QB_NEWB_MODAL";
export const closeQbNewbModal = createThunkAction(CLOSE_QB_NEWB_MODAL, () => {
  return async (_dispatch, getState) => {
    // persist the fact that this user has seen the NewbModal
    const { currentUser } = getState();
    await UserApi.update_qbnewb({ id: checkNotNull(currentUser).id });
  };
});
