import React, { useCallback, useState } from "react";
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

import type { SideView } from "./types";

interface ActionCreatorProps {
  isNew: boolean;
  canSave: boolean;

  question: Question;

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
  question,
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

  const closeSideView = useCallback(() => {
    setActiveSideView(DEFAULT_SIDE_VIEW);
  }, []);
  return (
    <Modal wide onClose={onCloseModal}>
      <ModalRoot>
        <ActionCreatorBodyContainer>
          <ModalLeft>
            <DataReferenceTriggerButton onClick={toggleDataRef} />
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

          {
            (
              {
                dataReference: <DataReferenceInline onClose={closeSideView} />,
                actionForm: (
                  <FormCreator
                    params={question?.parameters() ?? []}
                    formSettings={
                      question?.card()
                        ?.visualization_settings as ActionFormSettings
                    }
                    onChange={onChangeFormSettings}
                    onExampleClick={onClickExample}
                  />
                ),
              } as Record<SideView, React.ReactElement>
            )[activeSideView]
          }
        </ActionCreatorBodyContainer>
      </ModalRoot>
    </Modal>
  );
}
