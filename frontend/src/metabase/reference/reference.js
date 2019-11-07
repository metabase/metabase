import { assoc } from "icepick";
import _ from "underscore";

import {
  handleActions,
  createAction,
  createThunkAction,
  fetchData,
} from "metabase/lib/redux";

import MetabaseAnalytics from "metabase/lib/analytics";

import { GettingStartedApi } from "metabase/services";

import { filterUntouchedFields, isEmptyObject } from "./utils.js";

export const FETCH_GUIDE = "metabase/reference/FETCH_GUIDE";
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

export const fetchGuide = createThunkAction(FETCH_GUIDE, (reload = false) => {
  return async (dispatch, getState) => {
    const requestStatePath = ["reference", "guide"];
    const existingStatePath = requestStatePath;
    const getData = async () => {
      return await GettingStartedApi.get();
    };

    return await fetchData({
      dispatch,
      getState,
      requestStatePath,
      existingStatePath,
      getData,
      reload,
    });
  };
});

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
export const wrappedFetchGuide = async props => {
  fetchDataWrapper(props, async () => {
    await Promise.all([
      props.fetchGuide(),
      props.fetchDashboards(),
      props.fetchMetrics(),
      props.fetchSegments(),
      props.fetchRealDatabasesWithMetadata(),
    ]);
  })();
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
    await Promise.all([
      props.fetchMetricTable(mID),
      props.fetchMetrics(),
      props.fetchGuide(),
    ]);
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

// export const wrappedFetchDatabaseMetadataAndQuestion = async (props, databaseID) => {
//         clearError();
//         startLoading();
//         try {
//             await Promise.all(
//                     [props.fetchDatabaseMetadata(databaseID),
//                      props.fetchQuestions()]
//                 )
//         }
//         catch(error) {
//             console.error(error);
//             setError(error);
//         }

//         endLoading();
// }

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

export const rUpdateMetricDetail = async (metric, guide, formFields, props) => {
  props.startLoading();
  try {
    const editedFields = filterUntouchedFields(formFields, metric);
    if (!isEmptyObject(editedFields)) {
      const newMetric = { ...metric, ...editedFields };
      await props.updateMetric(newMetric);

      const importantFieldIds = formFields.important_fields.map(
        field => field.id,
      );
      const existingImportantFieldIds =
        guide.metric_important_fields &&
        guide.metric_important_fields[metric.id];

      const areFieldIdsIdentitical =
        existingImportantFieldIds &&
        existingImportantFieldIds.length === importantFieldIds.length &&
        existingImportantFieldIds.every(id => importantFieldIds.includes(id));

      if (!areFieldIdsIdentitical) {
        await props.updateMetricImportantFields(metric.id, importantFieldIds);
        wrappedFetchMetricDetail(props, metric.id);
      }
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

export const tryUpdateGuide = async (formFields, props) => {
  const {
    guide,
    dashboards,
    metrics,
    segments,
    tables,
    startLoading,
    endLoading,
    endEditing,
    setError,
    resetForm,
    updateDashboard,
    updateMetric,
    updateSegment,
    updateTable,
    updateMetricImportantFields,
    updateSetting,
    fetchGuide,
    setRequestUnloaded,
  } = props;

  startLoading();
  try {
    const updateNewEntities = ({ entities, formFields, updateEntity }) =>
      formFields.map(formField => {
        if (!formField.id) {
          return [];
        }

        const editedEntity = filterUntouchedFields(
          assoc(formField, "show_in_getting_started", true),
          entities[formField.id],
        );

        if (isEmptyObject(editedEntity)) {
          return [];
        }

        const newEntity = entities[formField.id];
        const updatedNewEntity = {
          ...newEntity,
          ...editedEntity,
        };

        const updatingNewEntity = updateEntity(updatedNewEntity);

        return [updatingNewEntity];
      });

    const updateOldEntities = ({
      newEntityIds,
      oldEntityIds,
      entities,
      updateEntity,
    }) =>
      oldEntityIds
        .filter(oldEntityId => !newEntityIds.includes(oldEntityId))
        .map(oldEntityId => {
          const oldEntity = entities[oldEntityId];

          const updatedOldEntity = assoc(
            oldEntity,
            "show_in_getting_started",
            false,
          );

          const updatingOldEntity = updateEntity(updatedOldEntity);

          return [updatingOldEntity];
        });
    //FIXME: necessary because revision_message is a mandatory field
    // even though we don't actually keep track of changes to caveats/points_of_interest yet
    const updateWithRevisionMessage = updateEntity => entity =>
      updateEntity(
        assoc(entity, "revision_message", "Updated in Getting Started guide."),
      );

    const updatingDashboards = updateNewEntities({
      entities: dashboards,
      formFields: [formFields.most_important_dashboard],
      updateEntity: updateDashboard,
    }).concat(
      updateOldEntities({
        newEntityIds: formFields.most_important_dashboard
          ? [formFields.most_important_dashboard.id]
          : [],
        oldEntityIds: guide.most_important_dashboard
          ? [guide.most_important_dashboard]
          : [],
        entities: dashboards,
        updateEntity: updateDashboard,
      }),
    );

    const updatingMetrics = updateNewEntities({
      entities: metrics,
      formFields: formFields.important_metrics,
      updateEntity: updateWithRevisionMessage(updateMetric),
    }).concat(
      updateOldEntities({
        newEntityIds: formFields.important_metrics.map(
          formField => formField.id,
        ),
        oldEntityIds: guide.important_metrics,
        entities: metrics,
        updateEntity: updateWithRevisionMessage(updateMetric),
      }),
    );

    const updatingMetricImportantFields = formFields.important_metrics.map(
      metricFormField => {
        if (!metricFormField.id || !metricFormField.important_fields) {
          return [];
        }
        const importantFieldIds = metricFormField.important_fields.map(
          field => field.id,
        );
        const existingImportantFieldIds =
          guide.metric_important_fields[metricFormField.id];

        const areFieldIdsIdentitical =
          existingImportantFieldIds &&
          existingImportantFieldIds.length === importantFieldIds.length &&
          existingImportantFieldIds.every(id => importantFieldIds.includes(id));
        if (areFieldIdsIdentitical) {
          return [];
        }

        return [
          updateMetricImportantFields(metricFormField.id, importantFieldIds),
        ];
      },
    );

    const segmentFields = formFields.important_segments_and_tables.filter(
      field => field.type === "segment",
    );

    const updatingSegments = updateNewEntities({
      entities: segments,
      formFields: segmentFields,
      updateEntity: updateWithRevisionMessage(updateSegment),
    }).concat(
      updateOldEntities({
        newEntityIds: segmentFields.map(formField => formField.id),
        oldEntityIds: guide.important_segments,
        entities: segments,
        updateEntity: updateWithRevisionMessage(updateSegment),
      }),
    );

    const tableFields = formFields.important_segments_and_tables.filter(
      field => field.type === "table",
    );

    const updatingTables = updateNewEntities({
      entities: tables,
      formFields: tableFields,
      updateEntity: updateTable,
    }).concat(
      updateOldEntities({
        newEntityIds: tableFields.map(formField => formField.id),
        oldEntityIds: guide.important_tables,
        entities: tables,
        updateEntity: updateTable,
      }),
    );

    const updatingThingsToKnow =
      guide.things_to_know !== formFields.things_to_know
        ? [
            updateSetting({
              key: "getting-started-things-to-know",
              value: formFields.things_to_know,
            }),
          ]
        : [];

    const updatingContactName =
      guide.contact &&
      formFields.contact &&
      guide.contact.name !== formFields.contact.name
        ? [
            updateSetting({
              key: "getting-started-contact-name",
              value: formFields.contact.name,
            }),
          ]
        : [];

    const updatingContactEmail =
      guide.contact &&
      formFields.contact &&
      guide.contact.email !== formFields.contact.email
        ? [
            updateSetting({
              key: "getting-started-contact-email",
              value: formFields.contact.email,
            }),
          ]
        : [];

    const updatingData = _.flatten([
      updatingDashboards,
      updatingMetrics,
      updatingMetricImportantFields,
      updatingSegments,
      updatingTables,
      updatingThingsToKnow,
      updatingContactName,
      updatingContactEmail,
    ]);

    if (updatingData.length > 0) {
      await Promise.all(updatingData);

      setRequestUnloaded(["reference", "guide"]);

      await fetchGuide();
    }
  } catch (error) {
    setError(error);
    console.error(error);
  }

  resetForm();
  endLoading();
  endEditing();
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
    [FETCH_GUIDE]: {
      next: (state, { payload }) => assoc(state, "guide", payload),
    },
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
