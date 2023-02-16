import React, { useCallback, useState } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import ActionCreatorHeader from "metabase/actions/containers/ActionCreator/ActionCreatorHeader";
import QueryActionEditor from "metabase/actions/containers/ActionCreator/QueryActionEditor";
import FormCreator from "metabase/actions/containers/ActionCreator/FormCreator";
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
} from "metabase/actions/containers/ActionCreator/ActionCreator.styled";

import { isNotNull } from "metabase/core/utils/types";
import type { ActionFormSettings, WritebackAction } from "metabase-types/api";
import type NativeQuery from "metabase-lib/queries/NativeQuery";
import type Question from "metabase-lib/Question";

import type { SideView } from "./types";
import InlineActionSettings, {
  ActionSettingsTriggerButton,
} from "./InlineActionSettings";

interface ActionCreatorProps {
  isNew: boolean;
  canSave: boolean;
  isEditable: boolean;

  action?: WritebackAction;
  question: Question;
  formSettings: ActionFormSettings;

  onChangeQuestionQuery: (query: NativeQuery) => void;
  onChangeName: (name: string) => void;
  onCloseModal?: () => void;
  onChangeFormSettings: (formSettings: ActionFormSettings) => void;
  onClickSave: () => void;
  onClickExample: () => void;
}

const DEFAULT_SIDE_VIEW: SideView = "actionForm";

export default function ActionCreatorView({
  isNew,
  canSave,
  isEditable,
  action,
  question,
  formSettings,
  onChangeQuestionQuery,
  onChangeName,
  onCloseModal,
  onChangeFormSettings,
  onClickSave,
  onClickExample,
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
    <ModalRoot>
      <ActionCreatorBodyContainer>
        <ModalLeft>
          <ActionCreatorHeader
            type="query"
            name={question.displayName() ?? t`New Action`}
            isEditable={isEditable}
            onChangeName={onChangeName}
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
          <EditorContainer>
            <QueryActionEditor
              query={question.query() as NativeQuery}
              isEditable={isEditable}
              onChangeQuestionQuery={onChangeQuestionQuery}
            />
          </EditorContainer>
          <ModalActions>
            <Button onClick={onCloseModal} borderless>
              {t`Cancel`}
            </Button>
            {isEditable && (
              <Button primary disabled={canSave} onClick={onClickSave}>
                {isNew ? t`Save` : t`Update`}
              </Button>
            )}
          </ModalActions>
        </ModalLeft>
        {activeSideView === "actionForm" ? (
          <FormCreator
            params={question.parameters() ?? []}
            formSettings={formSettings}
            isEditable={isEditable}
            onChange={onChangeFormSettings}
            onExampleClick={onClickExample}
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
      </ActionCreatorBodyContainer>
    </ModalRoot>
  );
}
