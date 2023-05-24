import { createReducer } from "@reduxjs/toolkit";
import { SetupState } from "metabase-types/store";
import {
  loadUserDefaults,
  loadLocaleDefaults,
  submitWelcomeStep,
} from "./actions_2";
import { LANGUAGE_STEP, WELCOME_STEP } from "./constants";

const initialState: SetupState = {
  step: WELCOME_STEP,
  isLocaleLoaded: false,
  isTrackingAllowed: false,
};

export const reducer = createReducer(initialState, builder => {
  builder.addCase(loadUserDefaults.fulfilled, (state, { payload }) => {
    state.user = payload;
  });
  builder.addCase(loadLocaleDefaults.fulfilled, (state, { payload }) => {
    state.locale = payload;
    state.isLocaleLoaded = true;
  });
  builder.addCase(submitWelcomeStep.fulfilled, state => {
    state.step = LANGUAGE_STEP;
  });
});
