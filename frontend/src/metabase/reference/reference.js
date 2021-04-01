import { assoc } from "icepick";

import { handleActions, createAction } from "metabase/lib/redux";

import MetabaseAnalytics from "metabase/lib/analytics";

import { filterUntouchedFields, isEmptyObject } from "./utils.js";

export const SET_ERROR = "metabase/reference/SET_ERROR";
export const CLEAR_ERROR = "metabase/reference/CLEAR_ERROR";
export const START_LOADING = "metabase/reference/START_LOADING";
export const END_LOADING = "metabase/reference/END_LOADING";
export const START_EDITING = "metabase/reference/START_EDITING";
export const END_EDITING = "metabase/reference/END_EDITING";
export const EXPAND_FORMULA = "metabase/reference/EXPAND_FORMULA";
export const COLLAPSE_FORMULA = "metabase/reference/COLLAPSE_FORMULA";
export const SHOW_DASHBOARD_MODAL = "metabase/reference/SHOW_DASHBOARD_MODAL";
export const HIDE_DASHBOARD_MODAL = "metabase/reference/HIDE_DASHBOARD_MODAL";

export const setError = createAction(SET_ERROR);

export const clearError = createAction(CLEAR_ERROR);

export const startLoading = createAction(START_LOADING);

export const endLoading = createAction(END_LOADING);

export const startEditing = createAction(START_EDITING, () => {
  MetabaseAnalytics.trackEvent("Data Reference", "Started Editing");
});

export const endEditing = createAction(END_EDITING, () => {
  MetabaseAnalytics.trackEvent("Data Reference", "Ended Editing");
});

export const expandFormula = createAction(EXPAND_FORMULA);

export const collapseFormula = createAction(COLLAPSE_FORMULA);

//TODO: consider making an app-wide modal state reducer and related actions
export const showDashboardModal = createAction(SHOW_DASHBOARD_MODAL);

export const hideDashboardModal = createAction(HIDE_DASHBOARD_MODAL);

// Helper functions. This is meant to be a transitional state to get things out of tryFetchData() and friends

const fetchDataWrapper = (props, fn) => {
  return async argument => {
    props.clearError();
    props.startLoading();
    try {
      await fn(argument);
    } catch (error) {
      console.error(error);
      props.setError(error);
    }

    props.endLoading();
  };
};

export const wrappedFetchDatabaseMetadata = (props, databaseID) => {
  fetchDataWrapper(props, props.fetchDatabaseMetadata)(databaseID);
};

export const wrappedFetchDatabaseMetadataAndQuestion = async (
  props,
  databaseID,
) => {
  fetchDataWrapper(props, async dbID => {
    await Promise.all([
      props.fetchDatabaseMetadata(dbID),
      props.fetchQuestions(),
    ]);
  })(databaseID);
};
export const wrappedFetchMetricDetail = async (props, metricID) => {
  fetchDataWrapper(props, async mID => {
    await Promise.all([props.fetchMetricTable(mID), props.fetchMetrics()]);
  })(metricID);
};
export const wrappedFetchMetricQuestions = async (props, metricID) => {
  fetchDataWrapper(props, async mID => {
    await Promise.all([
      props.fetchMetricTable(mID),
      props.fetchMetrics(),
      props.fetchQuestions(),
    ]);
  })(metricID);
};
export const wrappedFetchMetricRevisions = async (props, metricID) => {
  fetchDataWrapper(props, async mID => {
    await Promise.all([props.fetchMetricRevisions(mID), props.fetchMetrics()]);
  })(metricID);
};

export const wrappedFetchDatabases = props => {
  fetchDataWrapper(props, props.fetchRealDatabases)({});
};
export const wrappedFetchMetrics = props => {
  fetchDataWrapper(props, props.fetchMetrics)({});
};

export const wrappedFetchSegments = props => {
  fetchDataWrapper(props, props.fetchSegments)({});
};

export const wrappedFetchSegmentDetail = (props, segmentID) => {
  fetchDataWrapper(props, props.fetchSegmentTable)(segmentID);
};

export const wrappedFetchSegmentQuestions = async (props, segmentID) => {
  fetchDataWrapper(props, async sID => {
    await props.fetchSegments(sID);
    await Promise.all([props.fetchSegmentTable(sID), props.fetchQuestions()]);
  })(segmentID);
};
export const wrappedFetchSegmentRevisions = async (props, segmentID) => {
  fetchDataWrapper(props, async sID => {
    await props.fetchSegments(sID);
    await Promise.all([
      props.fetchSegmentRevisions(sID),
      props.fetchSegmentTable(sID),
    ]);
  })(segmentID);
};
export const wrappedFetchSegmentFields = async (props, segmentID) => {
  fetchDataWrapper(props, async sID => {
    await props.fetchSegments(sID);
    await Promise.all([
      props.fetchSegmentFields(sID),
      props.fetchSegmentTable(sID),
    ]);
  })(segmentID);
};

// This is called when a component gets a new set of props.
// I *think* this is un-necessary in all cases as we're using multiple
// components where the old code re-used the same component
export const clearState = props => {
  props.endEditing();
  props.endLoading();
  props.clearError();
  props.collapseFormula();
};

// This is called on the success or failure of a form triggered update
const resetForm = props => {
  props.resetForm();
  props.endLoading();
  props.endEditing();
};

// Update actions
// these use the "fetchDataWrapper" for now. It should probably be renamed.
// Using props to fire off actions, which imo should be refactored to
// dispatch directly, since there is no actual dependence with the props
// of that component

const updateDataWrapper = (props, fn) => {
  return async fields => {
    props.clearError();
    props.startLoading();
    try {
      const editedFields = filterUntouchedFields(fields, props.entity);
      if (!isEmptyObject(editedFields)) {
        const newEntity = { ...props.entity, ...editedFields };
        await fn(newEntity);
      }
    } catch (error) {
      console.error(error);
      props.setError(error);
    }
    resetForm(props);
  };
};

export const rUpdateSegmentDetail = (formFields, props) => {
  updateDataWrapper(props, props.updateSegment)(formFields);
};
export const rUpdateSegmentFieldDetail = (formFields, props) => {
  updateDataWrapper(props, props.updateField)(formFields);
};
export const rUpdateDatabaseDetail = (formFields, props) => {
  updateDataWrapper(props, props.updateDatabase)(formFields);
};
export const rUpdateTableDetail = (formFields, props) => {
  updateDataWrapper(props, props.updateTable)(formFields);
};
export const rUpdateFieldDetail = (formFields, props) => {
  updateDataWrapper(props, props.updateField)(formFields);
};

export const rUpdateMetricDetail = async (metric, formFields, props) => {
  props.startLoading();
  try {
    const editedFields = filterUntouchedFields(formFields, metric);
    if (!isEmptyObject(editedFields)) {
      const newMetric = { ...metric, ...editedFields };
      await props.updateMetric(newMetric);
    }
  } catch (error) {
    props.setError(error);
    console.error(error);
  }

  resetForm(props);
};

export const rUpdateFields = async (fields, formFields, props) => {
  props.startLoading();
  try {
    const updatedFields = Object.keys(formFields)
      .map(fieldId => ({
        field: fields[fieldId],
        formField: filterUntouchedFields(formFields[fieldId], fields[fieldId]),
      }))
      .filter(({ field, formField }) => !isEmptyObject(formField))
      .map(({ field, formField }) => ({ ...field, ...formField }));

    await Promise.all(updatedFields.map(props.updateField));
  } catch (error) {
    props.setError(error);
    console.error(error);
  }

  resetForm(props);
};

const initialState = {
  error: null,
  isLoading: false,
  isEditing: false,
  isFormulaExpanded: false,
  isDashboardModalOpen: false,
};
export default handleActions(
  {
    [SET_ERROR]: {
      throw: (state, { payload }) => assoc(state, "error", payload),
    },
    [CLEAR_ERROR]: {
      next: state => assoc(state, "error", null),
    },
    [START_LOADING]: {
      next: state => assoc(state, "isLoading", true),
    },
    [END_LOADING]: {
      next: state => assoc(state, "isLoading", false),
    },
    [START_EDITING]: {
      next: state => assoc(state, "isEditing", true),
    },
    [END_EDITING]: {
      next: state => assoc(state, "isEditing", false),
    },
    [EXPAND_FORMULA]: {
      next: state => assoc(state, "isFormulaExpanded", true),
    },
    [COLLAPSE_FORMULA]: {
      next: state => assoc(state, "isFormulaExpanded", false),
    },
    [SHOW_DASHBOARD_MODAL]: {
      next: state => assoc(state, "isDashboardModalOpen", true),
    },
    [HIDE_DASHBOARD_MODAL]: {
      next: state => assoc(state, "isDashboardModalOpen", false),
    },
  },
  initialState,
);
