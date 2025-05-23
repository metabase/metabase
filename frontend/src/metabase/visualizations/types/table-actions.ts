import type {
  ActionFormInitialValues,
  ActionFormSettings,
  FieldSettings,
  ParameterId,
  WritebackActionId,
} from "metabase-types/api";

export type TableActionsExecuteFormVizOverride = Partial<
  Omit<ActionFormSettings, "fields">
> & {
  fields?: Record<ParameterId, Partial<FieldSettings>>;
};

export type SelectedTableActionState = {
  actionId: WritebackActionId;
  rowData: ActionFormInitialValues;
  actionOverrides?: TableActionsExecuteFormVizOverride;
};
