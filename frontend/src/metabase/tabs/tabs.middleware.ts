import { createListenerMiddleware, isAnyOf } from "@reduxjs/toolkit";

import type { State } from "metabase/redux/store";

import { activateTab, addTab, removeTab, updateTab } from "./tabs.slice";
import { persistTabsState } from "./tabs.storage";

export const tabsListenerMiddleware = createListenerMiddleware();

tabsListenerMiddleware.startListening({
  matcher: isAnyOf(addTab, updateTab, removeTab, activateTab),
  effect: (_, api) => {
    const state = api.getState() as State;
    persistTabsState(state.tabs);
  },
});
