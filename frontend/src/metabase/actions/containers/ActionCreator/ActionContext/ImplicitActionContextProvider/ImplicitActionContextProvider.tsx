import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import ImplicitActionIcon from "metabase/actions/components/ImplicitActionIcon";
import type {
  ActionFormSettings,
  WritebackImplicitQueryAction,
} from "metabase-types/api";

import { getDefaultFormSettings } from "../../../../utils";
import type { ActionContextType } from "../ActionContext";
import { ActionContext } from "../ActionContext";
import type { ActionContextProviderProps } from "../types";

import {
  EditorBodyRoot,
  EditorTitle,
} from "./ImplicitActionContextProvider.styled";

export type ImplicitActionContextProviderProps = Omit<
  ActionContextProviderProps,
  "initialAction"
> & {
  initialAction: WritebackImplicitQueryAction;
};

function EditorBody() {
  return (
    <EditorBodyRoot>
      <ImplicitActionIcon size={64} />
      <EditorTitle>{t`Auto tracking schema`}</EditorTitle>
    </EditorBodyRoot>
  );
}

function ImplicitActionContextProvider({
  initialAction,
  children,
}: ImplicitActionContextProviderProps) {
  const [formSettings, setFormSettings] = useState(
    getDefaultFormSettings(initialAction.visualization_settings),
  );

  const handleFormSettingsChange = useCallback(
    (nextFormSettings: ActionFormSettings) => {
      setFormSettings(getDefaultFormSettings(nextFormSettings));
    },
    [],
  );

  const canSave = useMemo(() => {
    return !_.isEqual(
      getDefaultFormSettings(formSettings),
      getDefaultFormSettings(initialAction?.visualization_settings),
    );
  }, [formSettings, initialAction?.visualization_settings]);

  const value = useMemo<ActionContextType>(
    () => ({
      action: initialAction,
      formSettings,
      isNew: false,
      canSave,
      isDirty: canSave,
      ui: {
        canRename: false,
        canChangeFieldSettings: false,
      },
      handleFormSettingsChange,
      handleActionChange: _.noop,
      renderEditorBody: EditorBody,
    }),
    [initialAction, formSettings, canSave, handleFormSettingsChange],
  );

  return (
    <ActionContext.Provider value={value}>{children}</ActionContext.Provider>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ImplicitActionContextProvider;
