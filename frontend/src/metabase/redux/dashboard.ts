import { createAction } from "@reduxjs/toolkit";

import { createAction as createLegacyAction } from "metabase/utils/redux";
import type { DashboardTabId } from "metabase-types/api";

export const INITIALIZE = "metabase/dashboard/INITIALIZE";
export const initialize = createAction<{ clearCache?: boolean } | undefined>(
  INITIALIZE,
);

export const RESET = "metabase/dashboard/RESET";
export const reset = createAction(RESET);

export const SET_PARAMETER_VALUES = "metabase/dashboard/SET_PARAMETER_VALUES";
export const setParameterValues = createLegacyAction(SET_PARAMETER_VALUES);

export const SHOW_ADD_PARAMETER_POPOVER =
  "metabase/dashboard/SHOW_ADD_PARAMETER_POPOVER";
export const showAddParameterPopover = createLegacyAction(
  SHOW_ADD_PARAMETER_POPOVER,
);

export const SELECT_TAB = "metabase/dashboard/SELECT_TAB";

type SelectTabPayload = {
  tabId: DashboardTabId | null;
};

export const selectTab = createAction<SelectTabPayload>(SELECT_TAB);

export const UPDATE_DASHBOARD_AND_CARDS =
  "metabase/dashboard/UPDATE_DASHBOARD_AND_CARDS";

export const EDIT_QUESTION = "metabase/dashboard/EDIT_QUESTION";
export const NAVIGATE_TO_NEW_CARD = "metabase/dashboard/NAVIGATE_TO_NEW_CARD";

export const REVERT_TO_REVISION = "metabase/dashboard/REVERT_TO_REVISION";
