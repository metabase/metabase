import React from "react";
import { t } from "ttag";
import type { ReactNode } from "react";
import Button from "metabase/core/components/Button";
import Modal from "metabase/components/Modal";
import { ActionFormSettings } from "metabase-types/api";
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

import type NativeQuery from "metabase-lib/queries/NativeQuery";

import Question from "metabase-lib/Question";

interface ActionCreatorProps {
  isNew: boolean;
  isDataRefOpen: boolean;
  canSave: boolean;

  question: Question;

  onToggleDataRef: () => void;
  onCloseDataRef: () => void;
  onChangeQuestionQuery: (query: NativeQuery) => void;
  onChangeName: (name: string) => void;
  onCloseModal?: () => void;
  onChangeFormSettings: (formSettings: ActionFormSettings) => void;
  onClickSave: () => void;
  onClickExample: () => void;
}

export default function ActionCreatorView({
  isNew,
  isDataRefOpen,
  canSave,
  question,
  onToggleDataRef,
  onCloseDataRef,
  onChangeQuestionQuery,
  onChangeName,
  onCloseModal,
  onChangeFormSettings,
  onClickSave,
  onClickExample,
}: ActionCreatorProps) {
  return (
    <Modal wide onClose={onCloseModal}>
      <ModalRoot>
        <ActionCreatorBodyContainer>
          <ModalLeft>
            <DataReferenceTriggerButton onClick={onToggleDataRef} />
            <ActionCreatorHeader
              type="query"
              name={question.displayName() ?? t`New Action`}
              onChangeName={onChangeName}
            />
            <EditorContainer>
              <QueryActionEditor
                query={question.query() as NativeQuery}
                onChangeQuestionQuery={onChangeQuestionQuery}
              />
            </EditorContainer>
            <ModalActions>
              <Button onClick={onCloseModal} borderless>
                {t`Cancel`}
              </Button>
              <Button primary disabled={canSave} onClick={onClickSave}>
                {isNew ? t`Save` : t`Update`}
              </Button>
            </ModalActions>
          </ModalLeft>

          <DataReferenceInline
            isOpen={isDataRefOpen}
            onClose={onCloseDataRef}
          />

          {!isDataRefOpen && (
            <FormCreator
              params={question?.parameters() ?? []}
              formSettings={
                question?.card()?.visualization_settings as ActionFormSettings
              }
              onChange={onChangeFormSettings}
              onExampleClick={onClickExample}
            />
          )}
        </ActionCreatorBodyContainer>
      </ModalRoot>
    </Modal>
  );
}
