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
  id?: string;
  fields?: Record<ParameterId, Partial<FieldSettings>>;
};

export type SelectedTableActionState = {
  actionId: WritebackActionId;
  rowData: ActionFormInitialValues;
  actionOverrides?: TableActionsExecuteFormVizOverride;
};

export type BasicTableViewColumn = { name: string; display_name: string };
