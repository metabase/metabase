import { createReducer } from "@reduxjs/toolkit";
import { SetupState } from "metabase-types/store";
import {
  skipDatabase,
  loadLocaleDefaults,
  loadUserDefaults,
  selectStep,
  submitDatabase,
  submitPreferences,
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
  builder.addCase(updateLocale, (state, { payload: locale }) => {
    state.locale = locale;
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
  builder.addCase(submitDatabase.fulfilled, (state, { payload: database }) => {
    state.database = database;
    state.invite = undefined;
    state.step = PREFERENCES_STEP;
  });
  builder.addCase(submitUserInvite.fulfilled, (state, { payload: invite }) => {
    state.database = undefined;
    state.invite = invite;
    state.step = PREFERENCES_STEP;
  });
  builder.addCase(skipDatabase.fulfilled, state => {
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
  builder.addCase(submitPreferences.fulfilled, state => {
    state.step = COMPLETED_STEP;
  });
});
