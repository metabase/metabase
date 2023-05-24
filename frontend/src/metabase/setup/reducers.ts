import { createReducer } from "@reduxjs/toolkit";
import { SetupState } from "metabase-types/store";
import {
  cancelDatabaseStep,
  loadLocaleDefaults,
  loadUserDefaults,
  selectStep,
  submitDatabase,
  submitPreferencesStep,
  submitUser,
  submitUserInvite,
  updateDatabaseEngine,
  updateLocale,
  updateTracking,
} from "./actions";
import {
  COMPLETED_STEP,
  DATABASE_STEP,
  PREFERENCES_STEP,
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
  builder.addCase(updateLocale, (state, { payload: locale }) => {
    state.locale = locale;
  });
  builder.addCase(selectStep, (state, { payload: step }) => {
    state.step = step;
  });
  builder.addCase(submitUser.fulfilled, (state, { payload: user }) => {
    state.user = user;
    state.step = DATABASE_STEP;
  });
  builder.addCase(
    updateDatabaseEngine.fulfilled,
    (state, { payload: engine }) => {
      state.databaseEngine = engine;
    },
  );
  builder.addCase(submitDatabase.fulfilled, state => {
    state.invite = undefined;
    state.step = PREFERENCES_STEP;
  });
  builder.addCase(submitUserInvite.fulfilled, (state, { payload: invite }) => {
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
  builder.addCase(submitPreferencesStep.fulfilled, state => {
    state.step = COMPLETED_STEP;
  });
});
