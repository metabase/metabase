import { createReducer } from "@reduxjs/toolkit";

import type { SetupState } from "metabase-types/store";

import {
  loadLocaleDefaults,
  loadUserDefaults,
  selectStep,
  skipDatabase,
  submitDatabase,
  submitLicenseToken,
  submitSetup,
  submitUsageReason,
  submitUser,
  submitUserInvite,
  updateDatabaseEngine,
  updateLocale,
  updateTracking,
} from "./actions";

const initialState: SetupState = {
  step: "welcome",
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
  builder.addCase(submitUser.fulfilled, (state, { meta }) => {
    state.user = meta.arg;
  });
  builder.addCase(submitUsageReason.pending, (state, { meta }) => {
    const usageReason = meta.arg;
    state.usageReason = usageReason;
  });
  builder.addCase(submitLicenseToken.pending, (state, { meta }) => {
    const token = meta.arg;
    state.licenseToken = token;
  });

  builder.addCase(updateDatabaseEngine.pending, (state, { meta }) => {
    state.databaseEngine = meta.arg;
  });
  builder.addCase(submitDatabase.fulfilled, (state, { payload: database }) => {
    state.database = database;
    state.invite = undefined;
  });
  builder.addCase(submitUserInvite.pending, (state, { meta }) => {
    state.database = undefined;
    state.invite = meta.arg;
  });
  builder.addCase(skipDatabase.pending, state => {
    state.database = undefined;
    state.invite = undefined;
  });
  builder.addCase(updateTracking.fulfilled, (state, { meta }) => {
    state.isTrackingAllowed = meta.arg;
  });
  builder.addCase(submitSetup.fulfilled, state => {
    state.step = "completed";
  });
});
