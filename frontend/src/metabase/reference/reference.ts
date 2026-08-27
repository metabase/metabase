import { assoc } from "icepick";

import { createAction, handleActions } from "metabase/redux";

import { filterUntouchedFields, isEmptyObject } from "./utils";

export const START_EDITING = "metabase/reference/START_EDITING";
export const END_EDITING = "metabase/reference/END_EDITING";
export const EXPAND_FORMULA = "metabase/reference/EXPAND_FORMULA";
export const COLLAPSE_FORMULA = "metabase/reference/COLLAPSE_FORMULA";
export const SHOW_DASHBOARD_MODAL = "metabase/reference/SHOW_DASHBOARD_MODAL";
export const HIDE_DASHBOARD_MODAL = "metabase/reference/HIDE_DASHBOARD_MODAL";

export const startEditing = createAction(START_EDITING);

export const endEditing = createAction(END_EDITING);

export const expandFormula = createAction(EXPAND_FORMULA);

export const collapseFormula = createAction(COLLAPSE_FORMULA);

//TODO: consider making an app-wide modal state reducer and related actions
export const showDashboardModal = createAction(SHOW_DASHBOARD_MODAL);

export const hideDashboardModal = createAction(HIDE_DASHBOARD_MODAL);

interface UpdateProps {
  resetForm: () => void;
  endEditing: () => void;
  entity: Record<string, unknown>;
}

export interface ClearStateProps {
  endEditing: () => void;
  collapseFormula: () => void;
}

interface UpdateEntityProps extends UpdateProps {
  updateSegment: (entity: Record<string, unknown>) => Promise<unknown>;
  updateField: (entity: Record<string, unknown>) => Promise<unknown>;
  updateDatabase: (entity: Record<string, unknown>) => Promise<unknown>;
  updateTable: (entity: Record<string, unknown>) => Promise<unknown>;
}

// This is called when a component gets a new set of props.
// I *think* this is un-necessary in all cases as we're using multiple
// components where the old code re-used the same component
export const clearState = (props: ClearStateProps) => {
  props.endEditing();
  props.collapseFormula();
};

// This is called on the success or failure of a form triggered update
const resetForm = (props: UpdateProps) => {
  props.resetForm();
  props.endEditing();
};

// Update actions. Failures reach the caller, which reports them next to the
// form. Progress is formik's `isSubmitting`.

const updateDataWrapper = (
  props: UpdateProps,
  fn: (entity: Record<string, unknown>) => Promise<unknown>,
) => {
  return async (fields: Record<string, unknown>) => {
    try {
      const editedFields = filterUntouchedFields(fields, props.entity);
      if (!isEmptyObject(editedFields)) {
        const newEntity = { ...props.entity, ...editedFields };
        await fn(newEntity);
      }
    } finally {
      resetForm(props);
    }
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
    } finally {
      resetForm(props);
    }
  };
};

interface ReferenceState {
  isEditing: boolean;
  isFormulaExpanded: boolean;
  isDashboardModalOpen: boolean;
}

const initialState: ReferenceState = {
  isEditing: false,
  isFormulaExpanded: false,
  isDashboardModalOpen: false,
};
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default handleActions(
  {
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
