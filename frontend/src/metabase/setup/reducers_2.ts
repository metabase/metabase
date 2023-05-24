import { createReducer } from "@reduxjs/toolkit";
import { SetupState } from "metabase-types/store";
import {
  loadUserDefaults,
  loadLocaleDefaults,
  submitWelcomeStep,
  selectUserStep,
  submitUserStep,
  changeLocale,
  selectLanguageStep,
  submitLanguageStep,
  changeTracking,
  selectPreferencesStep,
  submitPreferencesStep,
} from "./actions_2";
import {
  COMPLETED_STEP,
  DATABASE_STEP,
  LANGUAGE_STEP,
  PREFERENCES_STEP,
  USER_STEP,
  WELCOME_STEP,
} from "./constants";

const initialState: SetupState = {
  step: WELCOME_STEP,
  isLocaleLoaded: false,
  isTrackingAllowed: false,
};

export const reducer = createReducer(initialState, builder => {
  builder.addCase(loadUserDefaults.fulfilled, (state, { payload: user }) => {
    state.user = user;
  });
  builder.addCase(
    loadLocaleDefaults.fulfilled,
    (state, { payload: locale }) => {
      state.locale = locale;
      state.isLocaleLoaded = true;
    },
  );
  builder.addCase(submitWelcomeStep.pending, state => {
    state.step = LANGUAGE_STEP;
  });

  builder.addCase(changeLocale, (state, { payload: locale }) => {
    state.locale = locale;
  });
  builder.addCase(selectLanguageStep, state => {
    state.step = LANGUAGE_STEP;
  });
  builder.addCase(submitLanguageStep, state => {
    state.step = USER_STEP;
  });

  builder.addCase(selectUserStep, state => {
    state.step = USER_STEP;
  });
  builder.addCase(submitUserStep.pending, (state, { payload: user }) => {
    state.user = user;
    state.step = DATABASE_STEP;
  });

  builder.addCase(
    changeTracking.pending,
    (state, { payload: isTrackingEnabled }) => {
      state.isTrackingAllowed = isTrackingEnabled;
    },
  );
  builder.addCase(selectPreferencesStep, state => {
    state.step = PREFERENCES_STEP;
  });
  builder.addCase(submitPreferencesStep.fulfilled, state => {
    state.step = COMPLETED_STEP;
  });
});
