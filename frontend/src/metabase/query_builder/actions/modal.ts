import { userApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { createThunkAction } from "metabase/redux";
import { checkNotNull } from "metabase/utils/types";

export const CLOSE_QB_NEWB_MODAL = "metabase/qb/CLOSE_QB_NEWB_MODAL";
export const closeQbNewbModal = createThunkAction(CLOSE_QB_NEWB_MODAL, () => {
  return async (dispatch, getState) => {
    // persist the fact that this user has seen the NewbModal
    const { currentUser } = getState();
    await runRtkEndpoint(
      checkNotNull(currentUser).id,
      dispatch,
      userApi.endpoints.updateUserModalQbnewb,
    );
  };
});
