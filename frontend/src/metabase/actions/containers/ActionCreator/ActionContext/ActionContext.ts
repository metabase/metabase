import { createContext, useContext } from "react";
import _ from "underscore";

import type { ActionFormSettings, WritebackAction } from "metabase-types/api";

import { getDefaultFormSettings } from "../../../utils";
import type { ActionCreatorUIProps } from "../types";

import type { EditableActionParams, EditorBodyProps } from "./types";
import { createEmptyWritebackAction } from "./utils";

export type ActionContextType = {
  action: Partial<WritebackAction>;
  formSettings: ActionFormSettings;
  canSave: boolean;
  isNew: boolean;
  isDirty: boolean;
  ui: ActionCreatorUIProps;
  handleActionChange: (action: EditableActionParams) => void;
  handleFormSettingsChange: (formSettings: ActionFormSettings) => void;
  renderEditorBody: (props: EditorBodyProps) => React.ReactNode;
};

export const ActionContext = createContext<ActionContextType>({
  action: createEmptyWritebackAction(),
  formSettings: getDefaultFormSettings(),
  canSave: false,
  isNew: true,
  isDirty: false,
  ui: {
    canRename: true,
    canChangeFieldSettings: true,
  },
  handleActionChange: _.noop,
  handleFormSettingsChange: _.noop,
  renderEditorBody: () => null,
});

export const useActionContext = () => useContext(ActionContext);
