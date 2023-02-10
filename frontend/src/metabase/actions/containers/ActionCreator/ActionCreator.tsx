import React, { useState, useEffect, useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";
import { connect } from "react-redux";

import Modal from "metabase/components/Modal";

import Actions, {
  CreateQueryActionParams,
  UpdateQueryActionParams,
} from "metabase/entities/actions";
import Database from "metabase/entities/databases";
import Questions from "metabase/entities/questions";
import { getMetadata } from "metabase/selectors/metadata";

import type {
  ActionFormSettings,
  Card,
  DatabaseId,
  WritebackActionId,
  WritebackQueryAction,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import Question from "metabase-lib/Question";
import NativeQuery from "metabase-lib/queries/NativeQuery";
import Metadata from "metabase-lib/metadata/Metadata";

import { getTemplateTagParametersFromCard } from "metabase-lib/parameters/utils/template-tags";

import { getDefaultFormSettings } from "../../utils";
import {
  newQuestion,
  convertActionToQuestion,
  convertQuestionToAction,
} from "./utils";
import ActionCreatorView from "./ActionCreatorView";
import CreateActionForm, {
  FormValues as CreateActionFormValues,
} from "./CreateActionForm";

interface OwnProps {
  actionId?: WritebackActionId;
  modelId: number;
  databaseId?: number;
  onClose?: () => void;
}

interface ActionLoaderProps {
  action?: WritebackQueryAction;
}

interface ModelLoaderProps {
  modelCard: Card;
}

interface StateProps {
  model: Question;
  metadata: Metadata;
}

interface DispatchProps {
  onCreateAction: (params: CreateQueryActionParams) => void;
  onUpdateAction: (params: UpdateQueryActionParams) => void;
}

export type ActionCreatorProps = OwnProps;

type Props = OwnProps &
  ActionLoaderProps &
  ModelLoaderProps &
  StateProps &
  DispatchProps;

const mapStateToProps = (state: State, { modelCard }: ModelLoaderProps) => ({
  model: new Question(modelCard, getMetadata(state)),
  metadata: getMetadata(state),
});

const mapDispatchToProps = {
  onCreateAction: Actions.actions.create,
  onUpdateAction: Actions.actions.update,
};

const EXAMPLE_QUERY =
  "UPDATE products\nSET rating = {{ my_new_value }}\nWHERE id = {{ my_primary_key }}";

function resolveQuestion(
  action: WritebackQueryAction | undefined,
  { metadata, databaseId }: { metadata: Metadata; databaseId?: DatabaseId },
) {
  return action
    ? convertActionToQuestion(action, metadata)
    : newQuestion(metadata, databaseId);
}

function ActionCreator({
  action,
  model,
  databaseId,
  metadata,
  onCreateAction,
  onUpdateAction,
  onClose,
}: Props) {
  const [question, setQuestion] = useState(
    resolveQuestion(action, { metadata, databaseId }),
  );

  const [formSettings, setFormSettings] = useState<ActionFormSettings>(
    getDefaultFormSettings(action?.visualization_settings),
  );

  const [showSaveModal, setShowSaveModal] = useState(false);

  const query = question.query() as NativeQuery;
  const isNew = !action && !question.isSaved();
  const isEditable = model.canWriteActions();

  useEffect(() => {
    setQuestion(resolveQuestion(action, { metadata, databaseId }));

    // we do not want to update this any time the props or metadata change, only if action id changes
  }, [action?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChangeQuestionQuery = useCallback(
    (newQuery: NativeQuery) => {
      const newQuestion = newQuery.question();
      const newParams = getTemplateTagParametersFromCard(newQuestion.card());
      setQuestion(newQuestion.setQuery(newQuery).setParameters(newParams));
    },
    [setQuestion],
  );

  const handleCreate = async (values: CreateActionFormValues) => {
    const action = convertQuestionToAction(question, formSettings);
    await onCreateAction({
      ...action,
      ...values,
      type: "query",
    });

    const nextQuestion = question
      .setDisplayName(values.name)
      .setDescription(values.description);
    setQuestion(nextQuestion);

    setShowSaveModal(false);
    onClose?.();
  };

  const handleUpdate = () => {
    const action = convertQuestionToAction(question, formSettings);
    onUpdateAction({ ...action, model_id: model.id() });
  };

  const handleClickSave = () => {
    if (isNew) {
      setShowSaveModal(true);
    } else {
      handleUpdate();
      onClose?.();
    }
  };

  const handleCloseNewActionModal = () => setShowSaveModal(false);

  const handleClickExample = () => {
    setQuestion(
      question.setQuery(query.setQueryText(query.queryText() + EXAMPLE_QUERY)),
    );
  };

  if (!question || !metadata) {
    return null;
  }

  return (
    <>
      <ActionCreatorView
        isNew={isNew}
        isEditable={isEditable}
        canSave={query.isEmpty()}
        action={action}
        question={question}
        formSettings={formSettings}
        onChangeQuestionQuery={handleChangeQuestionQuery}
        onChangeName={newName =>
          setQuestion(question => question.setDisplayName(newName))
        }
        onCloseModal={onClose}
        onChangeFormSettings={setFormSettings}
        onClickSave={handleClickSave}
        onClickExample={handleClickExample}
      />
      {showSaveModal && (
        <Modal title={t`New Action`} onClose={handleCloseNewActionModal}>
          <CreateActionForm
            initialValues={{
              name: question.displayName() ?? "",
              description: question.description(),
              model_id: model.id(),
            }}
            onCreate={handleCreate}
            onCancel={handleCloseNewActionModal}
          />
        </Modal>
      )}
    </>
  );
}

export default _.compose(
  Actions.load({
    id: (state: State, props: OwnProps) => props.actionId,
  }),
  Questions.load({
    id: (state: State, props: OwnProps) => props.modelId,
    entityAlias: "modelCard",
  }),
  Database.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(ActionCreator);
