import { createReducer } from "@reduxjs/toolkit";
import { SetupState } from "metabase-types/store";
import {
  loadUserDefaults,
  loadLocaleDefaults,
  submitWelcomeStep,
  selectUserStep,
  submitUserInfo,
  changeLocale,
  selectLanguageStep,
  submitLanguageInfo,
  updateTracking,
  selectPreferencesStep,
  submitPreferencesStep,
  cancelDatabaseStep,
  submitInviteInfo,
  selectDatabaseStep,
  updateEngine,
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
  builder.addCase(submitWelcomeStep.fulfilled, state => {
    state.step = LANGUAGE_STEP;
  });

  builder.addCase(changeLocale, (state, { payload: locale }) => {
    state.locale = locale;
  });
  builder.addCase(selectLanguageStep, state => {
    state.step = LANGUAGE_STEP;
  });
  builder.addCase(submitLanguageInfo, state => {
    state.step = USER_STEP;
  });

  builder.addCase(selectUserStep, state => {
    state.step = USER_STEP;
  });
  builder.addCase(submitUserInfo.fulfilled, (state, { payload: user }) => {
    state.user = user;
    state.step = DATABASE_STEP;
  });

  builder.addCase(selectDatabaseStep, state => {
    state.step = DATABASE_STEP;
  });
  builder.addCase(updateEngine.fulfilled, (state, { payload: engine }) => {
    state.databaseEngine = engine;
  });
  builder.addCase(submitInviteInfo.fulfilled, (state, { payload: invite }) => {
    state.database = undefined;
    state.invite = invite;
    state.step = PREFERENCES_STEP;
  });
  builder.addCase(cancelDatabaseStep.fulfilled, state => {
    state.database = undefined;
    state.invite = undefined;
    state.step = PREFERENCES_STEP;
  });

  builder.addCase(
    updateTracking.fulfilled,
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
