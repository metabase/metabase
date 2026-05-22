import {
  type PayloadAction,
  type Update,
  createEntityAdapter,
  createSlice,
  nanoid,
} from "@reduxjs/toolkit";

import type { State } from "metabase/redux/store";

import { loadPersistedTabsState } from "./tabs.storage";
import type { Tab, TabsState } from "./tabs.types";

const tabsAdapter = createEntityAdapter<Tab>();

const emptyInitialState: TabsState = tabsAdapter.getInitialState({
  activeId: undefined as string | undefined,
});

const tabsSlice = createSlice({
  name: "tabs",
  initialState: (): TabsState => loadPersistedTabsState() ?? emptyInitialState,
  reducers: {
    addTab: {
      reducer: (state, action: PayloadAction<Tab>) => {
        tabsAdapter.addOne(state, action.payload);
        state.activeId = action.payload.id;
      },
      prepare: (tab: Omit<Tab, "id">) => ({
        payload: { id: nanoid(), ...tab },
      }),
    },
    activateTab: (state, action: PayloadAction<string>) => {
      if (state.entities[action.payload]) {
        state.activeId = action.payload;
      }
    },
    removeTab: (state, action: PayloadAction<string>) => {
      const removedId = action.payload;
      tabsAdapter.removeOne(state, removedId);
      if (state.activeId === removedId) {
        state.activeId = (state.ids[0] as string | undefined) ?? undefined;
      }
    },
    updateTab: (state, action: PayloadAction<Update<Tab, string>>) => {
      tabsAdapter.updateOne(state, action.payload);
    },
  },
});

export const { addTab, activateTab, removeTab, updateTab } = tabsSlice.actions;
export const tabsReducer = tabsSlice.reducer;

const baseSelectors = tabsAdapter.getSelectors<State>((state) => state.tabs);

export const tabsSelectors = {
  ...baseSelectors,
  selectActiveId: (state: State) => state.tabs.activeId,
  selectActive: (state: State) => {
    const id = state.tabs.activeId;
    return id ? baseSelectors.selectById(state, id) : undefined;
  },
};
