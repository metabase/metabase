import { useCallback, useState } from "react";
import type * as React from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import ActionCreatorHeader from "metabase/actions/containers/ActionCreator/ActionCreatorHeader";
import { FormCreator } from "metabase/actions/containers/ActionCreator/FormCreator";
import {
  DataReferenceTriggerButton,
  DataReferenceInline,
} from "metabase/actions/containers/ActionCreator/InlineDataReference";
import {
  ActionCreatorBodyContainer,
  EditorContainer,
  ModalRoot,
  ModalActions,
  ModalLeft,
  ModalRight,
} from "metabase/actions/containers/ActionCreator/ActionCreator.styled";

import { isNotNull } from "metabase/lib/types";
import type { ActionFormSettings, WritebackAction } from "metabase-types/api";

import type { ActionCreatorUIProps, SideView } from "./types";
import InlineActionSettings, {
  ActionSettingsTriggerButton,
} from "./InlineActionSettings";

interface ActionCreatorProps extends ActionCreatorUIProps {
  action: Partial<WritebackAction>;
  formSettings: ActionFormSettings;

  canSave: boolean;
  isNew: boolean;
  isEditable: boolean;

  children: React.ReactNode;

  onChangeAction: (action: Partial<WritebackAction>) => void;
  onChangeFormSettings: (formSettings: ActionFormSettings) => void;
  onClickSave: () => void;
  onCloseModal?: () => void;
}

const DEFAULT_SIDE_VIEW: SideView = "actionForm";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function ActionCreatorView({
  action,
  formSettings,
  canSave,
  isNew,
  isEditable,
  canRename,
  canChangeFieldSettings,
  children,
  onChangeAction,
  onChangeFormSettings,
  onClickSave,
  onCloseModal,
}: ActionCreatorProps) {
  const [activeSideView, setActiveSideView] =
    useState<SideView>(DEFAULT_SIDE_VIEW);

  const toggleDataRef = useCallback(() => {
    setActiveSideView(activeSideView => {
      if (activeSideView !== "dataReference") {
        return "dataReference";
      }

      return DEFAULT_SIDE_VIEW;
    });
  }, []);

  const toggleActionSettings = useCallback(() => {
    setActiveSideView(activeSideView => {
      if (activeSideView !== "actionSettings") {
        return "actionSettings";
      }

      return DEFAULT_SIDE_VIEW;
    });
  }, []);

  const closeSideView = useCallback(() => {
    setActiveSideView(DEFAULT_SIDE_VIEW);
  }, []);

  return (
    <ModalRoot data-testid="action-creator">
      <ActionCreatorBodyContainer>
        <ModalLeft>
          <ActionCreatorHeader
            type="query"
            name={action.name ?? t`New Action`}
            canRename={canRename}
            isEditable={isEditable}
            onChangeName={name => onChangeAction({ name })}
            actionButtons={[
              <DataReferenceTriggerButton
                key="dataReference"
                onClick={toggleDataRef}
              />,
              <ActionSettingsTriggerButton
                key="actionSettings"
                onClick={toggleActionSettings}
              />,
            ].filter(isNotNull)}
          />
          <EditorContainer>{children}</EditorContainer>
          <ModalActions>
            <Button onClick={onCloseModal} borderless>
              {t`Cancel`}
            </Button>
            {isEditable && (
              <Button primary disabled={!canSave} onClick={onClickSave}>
                {isNew ? t`Save` : t`Update`}
              </Button>
            )}
          </ModalActions>
        </ModalLeft>
        <ModalRight>
          {activeSideView === "actionForm" ? (
            <FormCreator
              actionType={action.type ?? "query"}
              parameters={action.parameters ?? []}
              formSettings={formSettings}
              isEditable={isEditable && canChangeFieldSettings}
              onChange={onChangeFormSettings}
            />
          ) : activeSideView === "dataReference" ? (
            <DataReferenceInline onClose={closeSideView} />
          ) : activeSideView === "actionSettings" ? (
            <InlineActionSettings
              action={action}
              formSettings={formSettings}
              isEditable={isEditable}
              onChangeFormSettings={onChangeFormSettings}
              onClose={closeSideView}
            />
          ) : null}
        </ModalRight>
      </ActionCreatorBodyContainer>
    </ModalRoot>
  );
}
