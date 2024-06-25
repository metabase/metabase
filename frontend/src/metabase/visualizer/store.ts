import { createAction, createReducer, createSelector } from "@reduxjs/toolkit";
import { VisualizerState } from "metabase-types/store/visualizer";

const OPEN_VIZ_SETTINGS = "metabase/visualizer/OPEN_VIZ_SETTINGS";
const CLOSE_VIZ_SETTINGS = "metabase/visualizer/CLOSE_VIZ_SETTINGS";
const TOGGLE_VIZ_SETTINGS = "metabase/visualizer/TOGGLE_VIZ_SETTINGS";

export const openVizSettings = createAction(OPEN_VIZ_SETTINGS);
export const closeVizSettings = createAction(CLOSE_VIZ_SETTINGS);
const toggleVizSettings = createAction(TOGGLE_VIZ_SETTINGS);

const initialState: VisualizerState = {
  ui: {
    vizSettings: false,
    data: true,
  },
};

const getVisualizerState = (state: any) => state.visualizer;

export const getVizSettingsDisplay = createSelector(
  getVisualizerState,
  state => {
    return state.ui.vizSettings;
  },
);

export const visualizer = createReducer(initialState, builder => {
  builder.addCase(openVizSettings, state => {
    return {
      ...state,
      ui: { vizSettings: true, data: false },
    };
  });
  builder.addCase(closeVizSettings, state => {
    return {
      ...state,
      ui: { vizSettings: false, data: true },
    };
  });
  builder.addCase(toggleVizSettings, state => {
    return {
      ...state,
      ui: { vizSettings: !state.ui.vizSettings, data: !state.ui.data },
    };
  });
});
