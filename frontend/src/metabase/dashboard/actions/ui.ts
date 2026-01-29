import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { createThunkAction } from "metabase/lib/redux";
import type { DashCardId } from "metabase-types/api";
import type {
  DashboardSidebarName,
  Dispatch,
  GetState,
} from "metabase-types/store";

import { getSidebar } from "../selectors";

import { closeAutoApplyFiltersToast } from "./parameters";
// Re-export sidebar actions from sidebar.ts to maintain backwards compatibility
// (sidebar actions are in a separate file to avoid circular dependency with parameters.tsx)
import { CLOSE_SIDEBAR, closeSidebar, SET_SIDEBAR, setSidebar } from "./sidebar";

export { CLOSE_SIDEBAR, closeSidebar, SET_SIDEBAR, setSidebar };

export const showClickBehaviorSidebar =
  (dashcardId: DashCardId | null) => (dispatch: Dispatch) => {
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

export const toggleSidebar =
  (name: DashboardSidebarName) => (dispatch: Dispatch, getState: GetState) => {
    const currentSidebarName = getSidebar(getState()).name;
    if (currentSidebarName === name) {
      dispatch(closeSidebar());
    } else {
      dispatch(setSidebar({ name }));
    }
  };

export const openAddQuestionSidebar = () => (dispatch: Dispatch) => {
  dispatch(
    setSidebar({
      name: SIDEBAR_NAME.addQuestion,
    }),
  );
};

export const CLOSE_DASHBOARD = "metabase/dashboard/CLOSE_DASHBOARD";
export const closeDashboard = createThunkAction(
  CLOSE_DASHBOARD,
  () => (dispatch) => {
    dispatch(closeAutoApplyFiltersToast());
  },
);
