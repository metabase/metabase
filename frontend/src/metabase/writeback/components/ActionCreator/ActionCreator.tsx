import React, { useState, useEffect } from "react";
import { t } from "ttag";
import _ from "underscore";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import Actions from "metabase/entities/actions";
import { getMetadata } from "metabase/selectors/metadata";
import { createQuestionFromAction } from "metabase/writeback/selectors";
import type {
  WritebackQueryAction,
  ActionFormSettings,
} from "metabase-types/api";
import type { State } from "metabase-types/store";
import Modal from "metabase/components/Modal";
import { SavedCard } from "metabase-types/types/Card";
import Question from "metabase-lib/lib/Question";

import type NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import type Metadata from "metabase-lib/lib/metadata/Metadata";

import { ActionCreatorHeader } from "./ActionCreatorHeader";
import { QueryActionEditor } from "./QueryActionEditor";
import { FormCreator } from "./FormCreator";

import {
  ActionCreatorRoot,
  ActionCreatorBodyContainer,
} from "./ActionCreator.styled";

import { newQuestion } from "./utils";

const mapStateToProps = (
  state: State,
  { action }: { action: WritebackQueryAction },
) => ({
  metadata: getMetadata(state),
  question: action ? createQuestionFromAction(state, action) : undefined,
  actionId: action ? action.id : undefined,
});

const mapDispatchToProps = {
  push,
};

interface ActionCreatorProps {
  metadata: Metadata;
  question?: Question;
  actionId?: number;
  push: (url: string) => void;
}

function ActionCreatorComponent({
  metadata,
  question: passedQuestion,
  actionId,
  push,
}: ActionCreatorProps) {
  const [question, setQuestion] = useState(
    passedQuestion ?? newQuestion(metadata),
  );
  const [formSettings, setFormSettings] = useState<
    ActionFormSettings | undefined
  >(undefined);
  const [showSaveModal, setShowSaveModal] = useState(false);

  useEffect(() => {
    setQuestion(passedQuestion ?? newQuestion(metadata));
    // we do not want to update this any time the props or metadata change, only if action id changes
  }, [actionId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!question || !metadata) {
    return null;
  }

  const query = question.query() as NativeQuery;

  const afterSave = (action: SavedCard) => {
    setQuestion(question.setCard(action));
    setTimeout(() => setShowSaveModal(false), 1000);
    if (!actionId && action.action_id) {
      setTimeout(() => push(`/action/${action.action_id}`), 1500);
    }
  };

  const handleClose = () => setShowSaveModal(false);

  const isNew = !actionId && !(question.card() as SavedCard).id;

  return (
    <ActionCreatorRoot>
      <ActionCreatorHeader
        type="query"
        name={question.displayName() ?? t`New Action`}
        onChangeName={newName => setQuestion(q => q.setDisplayName(newName))}
        onSave={() => setShowSaveModal(true)}
        canSave={question.query().canRun()}
      />
      <ActionCreatorBodyContainer>
        <QueryActionEditor question={question} setQuestion={setQuestion} />
        <FormCreator
          tags={query?.templateTagsWithoutSnippets()}
          formSettings={
            question?.card()?.visualization_settings as ActionFormSettings
          }
          onChange={setFormSettings}
        />
      </ActionCreatorBodyContainer>
      {showSaveModal && (
        <Modal onClose={handleClose}>
          <Actions.ModalForm
            title={isNew ? t`New action` : t`Save action`}
            form={isNew ? Actions.forms.saveForm : Actions.forms.updateForm}
            action={{
              id: (question.card() as SavedCard).id,
              name: question.displayName(),
              description: question.description(),
              collection_id: question.collectionId(),
              formSettings,
              question,
            }}
            onSaved={afterSave}
            onClose={handleClose}
          />
        </Modal>
      )}
    </ActionCreatorRoot>
  );
}

export const ActionCreator = _.compose(
  Actions.load({
    id: (state: State, props: { actionId?: number }) => props.actionId,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(ActionCreatorComponent);
