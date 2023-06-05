import { createReducer } from "@reduxjs/toolkit";
import { SetupState } from "metabase-types/store";
import {
  skipDatabase,
  loadLocaleDefaults,
  loadUserDefaults,
  selectStep,
  submitDatabase,
  submitUser,
  submitUserInvite,
  updateDatabaseEngine,
  updateLocale,
  updateTracking,
  submitSetup,
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
  isTrackingAllowed: true,
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
  builder.addCase(selectStep, (state, { payload: step }) => {
    state.step = step;
  });
  builder.addCase(updateLocale.pending, (state, { meta }) => {
    state.locale = meta.arg;
    state.isLocaleLoaded = false;
  });
  builder.addCase(updateLocale.fulfilled, state => {
    state.isLocaleLoaded = true;
  });
  builder.addCase(submitUser.pending, (state, { meta }) => {
    state.user = meta.arg;
    state.step = DATABASE_STEP;
  });
  builder.addCase(updateDatabaseEngine.pending, (state, { meta }) => {
    state.databaseEngine = meta.arg;
  });
  builder.addCase(submitDatabase.fulfilled, (state, { payload: database }) => {
    state.database = database;
    state.invite = undefined;
    state.step = PREFERENCES_STEP;
  });
  builder.addCase(submitUserInvite.pending, (state, { meta }) => {
    state.database = undefined;
    state.invite = meta.arg;
    state.step = PREFERENCES_STEP;
  });
  builder.addCase(skipDatabase.pending, state => {
    state.database = undefined;
    state.invite = undefined;
    state.step = PREFERENCES_STEP;
  });
  builder.addCase(updateTracking.pending, (state, { meta }) => {
    state.isTrackingAllowed = meta.arg;
  });
  builder.addCase(submitSetup.fulfilled, state => {
    state.step = COMPLETED_STEP;
  });
});
