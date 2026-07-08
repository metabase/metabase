import { assoc } from "icepick";

import { createAction, handleActions } from "metabase/redux";

import { filterUntouchedFields, isEmptyObject } from "./utils";

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

export const startEditing = createAction(START_EDITING);

export const endEditing = createAction(END_EDITING);

export const expandFormula = createAction(EXPAND_FORMULA);

export const collapseFormula = createAction(COLLAPSE_FORMULA);

//TODO: consider making an app-wide modal state reducer and related actions
export const showDashboardModal = createAction(SHOW_DASHBOARD_MODAL);

export const hideDashboardModal = createAction(HIDE_DASHBOARD_MODAL);

export interface FetchProps {
  clearError: () => void;
  startLoading: () => void;
  endLoading: () => void;
  setError: (error: unknown) => void;
}

interface UpdateProps extends FetchProps {
  resetForm: () => void;
  endEditing: () => void;
  entity: Record<string, unknown>;
}

interface DatabaseFetchProps extends FetchProps {
  fetchDatabaseMetadata: (id: number) => Promise<unknown>;
  fetchQuestions: () => Promise<unknown>;
  fetchRealDatabases: (args: unknown) => Promise<unknown>;
}

interface SegmentFetchProps extends FetchProps {
  fetchSegments: (id?: number) => Promise<unknown>;
  fetchSegmentTable: (id: number) => Promise<unknown>;
  fetchSegmentRevisions: (id: number) => Promise<unknown>;
  fetchSegmentFields: (id: number) => Promise<unknown>;
  fetchQuestions: () => Promise<unknown>;
}

export interface ClearStateProps {
  endEditing: () => void;
  endLoading: () => void;
  clearError: () => void;
  collapseFormula: () => void;
}

interface UpdateEntityProps extends UpdateProps {
  updateSegment: (entity: Record<string, unknown>) => Promise<unknown>;
  updateField: (entity: Record<string, unknown>) => Promise<unknown>;
  updateDatabase: (entity: Record<string, unknown>) => Promise<unknown>;
  updateTable: (entity: Record<string, unknown>) => Promise<unknown>;
}

// Helper functions. This is meant to be a transitional state to get things out of tryFetchData() and friends

const fetchDataWrapper = <T>(
  props: FetchProps,
  fn: (argument: T) => Promise<unknown>,
) => {
  return async (argument: T) => {
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

export const wrappedFetchDatabaseMetadata = (
  props: FetchProps & Pick<DatabaseFetchProps, "fetchDatabaseMetadata">,
  databaseID: number,
) => {
  fetchDataWrapper(props, props.fetchDatabaseMetadata)(databaseID);
};

export const wrappedFetchDatabaseMetadataAndQuestion = async (
  props: FetchProps &
    Pick<DatabaseFetchProps, "fetchDatabaseMetadata" | "fetchQuestions">,
  databaseID: number,
) => {
  fetchDataWrapper(props, async (dbID: number) => {
    await Promise.all([
      props.fetchDatabaseMetadata(dbID),
      props.fetchQuestions(),
    ]);
  })(databaseID);
};
export const wrappedFetchDatabases = (
  props: FetchProps & Pick<DatabaseFetchProps, "fetchRealDatabases">,
) => {
  fetchDataWrapper(props, props.fetchRealDatabases)({});
};
export const wrappedFetchSegments = (
  props: FetchProps & Pick<SegmentFetchProps, "fetchSegments">,
) => {
  fetchDataWrapper(props, props.fetchSegments)(undefined);
};

export const wrappedFetchSegmentDetail = (
  props: FetchProps & Pick<SegmentFetchProps, "fetchSegmentTable">,
  segmentID: number,
) => {
  fetchDataWrapper(props, props.fetchSegmentTable)(segmentID);
};

export const wrappedFetchSegmentQuestions = async (
  props: FetchProps &
    Pick<
      SegmentFetchProps,
      "fetchSegments" | "fetchSegmentTable" | "fetchQuestions"
    >,
  segmentID: number,
) => {
  fetchDataWrapper(props, async (sID: number) => {
    await props.fetchSegments(sID);
    await Promise.all([props.fetchSegmentTable(sID), props.fetchQuestions()]);
  })(segmentID);
};
export const wrappedFetchSegmentRevisions = async (
  props: FetchProps &
    Pick<
      SegmentFetchProps,
      "fetchSegments" | "fetchSegmentRevisions" | "fetchSegmentTable"
    >,
  segmentID: number,
) => {
  fetchDataWrapper(props, async (sID: number) => {
    await props.fetchSegments(sID);
    await Promise.all([
      props.fetchSegmentRevisions(sID),
      props.fetchSegmentTable(sID),
    ]);
  })(segmentID);
};
export const wrappedFetchSegmentFields = async (
  props: FetchProps &
    Pick<
      SegmentFetchProps,
      "fetchSegments" | "fetchSegmentFields" | "fetchSegmentTable"
    >,
  segmentID: number,
) => {
  fetchDataWrapper(props, async (sID: number) => {
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
export const clearState = (props: ClearStateProps) => {
  props.endEditing();
  props.endLoading();
  props.clearError();
  props.collapseFormula();
};

// This is called on the success or failure of a form triggered update
const resetForm = (props: UpdateProps) => {
  props.resetForm();
  props.endLoading();
  props.endEditing();
};

// Update actions
// these use the "fetchDataWrapper" for now. It should probably be renamed.
// Using props to fire off actions, which imo should be refactored to
// dispatch directly, since there is no actual dependence with the props
// of that component

const updateDataWrapper = (
  props: UpdateProps,
  fn: (entity: Record<string, unknown>) => Promise<unknown>,
) => {
  return async (fields: Record<string, unknown>) => {
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

export const rUpdateSegmentDetail = (
  formFields: Record<string, unknown>,
  props: UpdateEntityProps,
) => {
  return () => updateDataWrapper(props, props.updateSegment)(formFields);
};
export const rUpdateSegmentFieldDetail = (
  formFields: Record<string, unknown>,
  props: UpdateEntityProps,
) => {
  return () => updateDataWrapper(props, props.updateField)(formFields);
};
export const rUpdateDatabaseDetail = (
  formFields: Record<string, unknown>,
  props: UpdateEntityProps,
) => {
  return () => updateDataWrapper(props, props.updateDatabase)(formFields);
};
export const rUpdateTableDetail = (
  formFields: Record<string, unknown>,
  props: UpdateEntityProps,
) => {
  return () => updateDataWrapper(props, props.updateTable)(formFields);
};
export const rUpdateFieldDetail = (
  formFields: Record<string, unknown>,
  props: UpdateEntityProps,
) => {
  return () => updateDataWrapper(props, props.updateField)(formFields);
};

interface UpdateFieldsProps extends UpdateProps {
  updateField: (field: Record<string, unknown>) => Promise<unknown>;
}

export const rUpdateFields = (
  fields: Record<string, Record<string, unknown>>,
  formFields: Record<string, Record<string, unknown>>,
  props: UpdateFieldsProps,
) => {
  return async () => {
    props.startLoading();
    try {
      const updatedFields = Object.keys(formFields)
        .map((fieldId) => ({
          field: fields[fieldId],
          formField: filterUntouchedFields(
            formFields[fieldId],
            fields[fieldId],
          ),
        }))
        .filter(({ formField }) => !isEmptyObject(formField))
        .map(({ field, formField }) => ({ ...field, ...formField }));

      await Promise.all(updatedFields.map(props.updateField));
    } catch (error) {
      props.setError(error);
      console.error(error);
    }

    resetForm(props);
  };
};

interface ReferenceState {
  error: unknown;
  isLoading: boolean;
  isEditing: boolean;
  isFormulaExpanded: boolean;
  isDashboardModalOpen: boolean;
}

const initialState: ReferenceState = {
  error: null,
  isLoading: false,
  isEditing: false,
  isFormulaExpanded: false,
  isDashboardModalOpen: false,
};
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default handleActions(
  {
    [SET_ERROR]: {
      throw: (state: ReferenceState, { payload }: { payload: unknown }) =>
        assoc(state, "error", payload),
    },
    [CLEAR_ERROR]: {
      next: (state: ReferenceState) => assoc(state, "error", null),
    },
    [START_LOADING]: {
      next: (state: ReferenceState) => assoc(state, "isLoading", true),
    },
    [END_LOADING]: {
      next: (state: ReferenceState) => assoc(state, "isLoading", false),
    },
    [START_EDITING]: {
      next: (state: ReferenceState) => assoc(state, "isEditing", true),
    },
    [END_EDITING]: {
      next: (state: ReferenceState) => assoc(state, "isEditing", false),
    },
    [EXPAND_FORMULA]: {
      next: (state: ReferenceState) => assoc(state, "isFormulaExpanded", true),
    },
    [COLLAPSE_FORMULA]: {
      next: (state: ReferenceState) => assoc(state, "isFormulaExpanded", false),
    },
    [SHOW_DASHBOARD_MODAL]: {
      next: (state: ReferenceState) =>
        assoc(state, "isDashboardModalOpen", true),
    },
    [HIDE_DASHBOARD_MODAL]: {
      next: (state: ReferenceState) =>
        assoc(state, "isDashboardModalOpen", false),
    },
  },
  initialState,
);
