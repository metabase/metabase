import React, { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import ImplicitActionIcon from "metabase/actions/components/ImplicitActionIcon";

import type { WritebackImplicitQueryAction } from "metabase-types/api";

import { getDefaultFormSettings } from "../../../../utils";
import type { ActionContextProviderProps } from "../types";
import { ActionContext } from "../ActionContext";
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
  const value = useMemo(
    () => ({
      action: initialAction,
      formSettings: getDefaultFormSettings(
        initialAction?.visualization_settings,
      ),
      isNew: false,
      canSave: false,
      ui: {
        canRename: false,
        canChangeFormSettings: false,
        hasSaveButton: false,
      },
      handleActionChange: _.noop,
      handleFormSettingsChange: _.noop,
      handleSetupExample: _.noop,
      renderEditorBody: EditorBody,
    }),
    [initialAction],
  );

  return (
    <ActionContext.Provider value={value}>{children}</ActionContext.Provider>
  );
}

export default ImplicitActionContextProvider;
