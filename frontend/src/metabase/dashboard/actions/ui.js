import { createAction } from "metabase/lib/redux";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { getSidebar } from "../selectors";

export const SET_SIDEBAR = "metabase/dashboard/SET_SIDEBAR";
export const setSidebar = createAction(SET_SIDEBAR);

export const CLOSE_SIDEBAR = "metabase/dashboard/CLOSE_SIDEBAR";
export const closeSidebar = createAction(CLOSE_SIDEBAR);

export const showClickBehaviorSidebar = dashcardId => dispatch => {
  if (dashcardId != null) {
    dispatch(
      setSidebar({
        name: SIDEBAR_NAME.clickBehavior,
        props: { dashcardId },
      }),
    );
  } else {
    dispatch(closeSidebar());
  }
};

export const toggleSidebar = name => (dispatch, getState) => {
  const currentSidebarName = getSidebar(getState()).name;
  if (currentSidebarName === name) {
    dispatch(closeSidebar());
  } else {
    dispatch(setSidebar({ name }));
  }
};

export const openAddQuestionSidebar = () => dispatch => {
  dispatch(
    setSidebar({
      name: SIDEBAR_NAME.addQuestion,
    }),
  );
};
