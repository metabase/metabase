import { createSelector } from 'reselect';


const activeStepSelector          = state => state.activeStep;
const userDetailsSelector         = state => state.userDetails;
const databaseDetailsSelector     = state => state.databaseDetails;
const allowTrackingSelector       = state => state.allowTracking;
const setupErrorSelector          = state => state.setupError;
const setupCompleteSelector       = state => state.setupComplete;
const enginesSelector             = state => state.engines;


// our master selector which combines all of our partial selectors above
export const setupSelectors = createSelector(
	[activeStepSelector, userDetailsSelector, databaseDetailsSelector, allowTrackingSelector, setupErrorSelector, setupCompleteSelector, enginesSelector],
	(activeStep, userDetails, databaseDetails, allowTracking, setupError, setupComplete, engines) => ({activeStep, userDetails, databaseDetails, allowTracking, setupError, setupComplete, engines})
);
