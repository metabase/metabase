import { createReducer } from "@reduxjs/toolkit";
import type { SetupState } from "metabase-types/store";
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
  submitUsageReason,
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
  builder.addCase(submitUser.pending, (state, { meta }) => {
    state.user = meta.arg;
    state.step = "usage_question";
  });
  builder.addCase(submitUsageReason.pending, (state, { meta }) => {
    const usageReason = meta.arg;
    state.usageReason = usageReason;
    // this logic will be refactored before we introduce more steps, to be less fragile
    state.step = usageReason === "embedding" ? "data_usage" : "db_connection";
  });
  builder.addCase(updateDatabaseEngine.pending, (state, { meta }) => {
    state.databaseEngine = meta.arg;
  });
  builder.addCase(submitDatabase.fulfilled, (state, { payload: database }) => {
    state.database = database;
    state.invite = undefined;
    state.step = "data_usage";
  });
  builder.addCase(submitUserInvite.pending, (state, { meta }) => {
    state.database = undefined;
    state.invite = meta.arg;
    state.step = "data_usage";
  });
  builder.addCase(skipDatabase.pending, state => {
    state.database = undefined;
    state.invite = undefined;
    state.step = "data_usage";
  });
  builder.addCase(updateTracking.pending, (state, { meta }) => {
    state.isTrackingAllowed = meta.arg;
  });
  builder.addCase(submitSetup.fulfilled, state => {
    state.step = "completed";
  });
});
