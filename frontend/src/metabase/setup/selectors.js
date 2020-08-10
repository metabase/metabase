import { createSelector } from "reselect";

const activeStepSelector = state => state.setup.activeStep;
const userDetailsSelector = state => state.setup.userDetails;
const databaseDetailsSelector = state => state.setup.databaseDetails;
const allowTrackingSelector = state => state.setup.allowTracking;
const setupErrorSelector = state => state.setup.setupError;
const setupCompleteSelector = state => state.setup.setupComplete;

// our master selector which combines all of our partial selectors above
export const setupSelectors = createSelector(
  [
    activeStepSelector,
    userDetailsSelector,
    databaseDetailsSelector,
    allowTrackingSelector,
    setupErrorSelector,
    setupCompleteSelector,
  ],
  (
    activeStep,
    userDetails,
    databaseDetails,
    allowTracking,
    setupError,
    setupComplete,
  ) => ({
    activeStep,
    userDetails,
    databaseDetails,
    allowTracking,
    setupError,
    setupComplete,
  }),
);
