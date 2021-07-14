import { createSelector } from "reselect";
import { getValues } from "redux-form";

export const DATABASE_FORM_NAME = "database";

const activeStepSelector = state => state.setup.activeStep;
const userDetailsSelector = state => state.setup.userDetails;
const databaseDetailsSelector = state => state.setup.databaseDetails;
const allowTrackingSelector = state => state.setup.allowTracking;
const setupErrorSelector = state => state.setup.setupError;
const setupCompleteSelector = state => state.setup.setupComplete;

function selectedDatabaseEngineSelector(state) {
  const formValues = getValues(state.form[DATABASE_FORM_NAME]);
  return formValues ? formValues.engine : undefined;
}

// our master selector which combines all of our partial selectors above
export const setupSelectors = createSelector(
  [
    activeStepSelector,
    userDetailsSelector,
    databaseDetailsSelector,
    allowTrackingSelector,
    setupErrorSelector,
    setupCompleteSelector,
    selectedDatabaseEngineSelector,
  ],
  (
    activeStep,
    userDetails,
    databaseDetails,
    allowTracking,
    setupError,
    setupComplete,
    selectedDatabaseEngine,
  ) => ({
    activeStep,
    userDetails,
    databaseDetails,
    allowTracking,
    setupError,
    setupComplete,
    selectedDatabaseEngine,
  }),
);
