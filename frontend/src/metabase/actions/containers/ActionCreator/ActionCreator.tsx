import React, { useState, useMemo, useEffect, useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";
import { connect } from "react-redux";

import Modal from "metabase/components/Modal";

import Actions, {
  CreateQueryActionParams,
  UpdateQueryActionParams,
} from "metabase/entities/actions";
import Database from "metabase/entities/databases";
import { getMetadata } from "metabase/selectors/metadata";

import { createQuestionFromAction } from "metabase/actions/selectors";

import type {
  ActionFormSettings,
  WritebackActionId,
  WritebackQueryAction,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import type NativeQuery from "metabase-lib/queries/NativeQuery";
import type Metadata from "metabase-lib/metadata/Metadata";
import type Question from "metabase-lib/Question";

import { getTemplateTagParametersFromCard } from "metabase-lib/parameters/utils/template-tags";

import { getDefaultFormSettings } from "../../utils";
import { newQuestion, convertQuestionToAction } from "./utils";
import ActionCreatorView from "./ActionCreatorView";
import CreateActionForm, {
  FormValues as CreateActionFormValues,
} from "./CreateActionForm";

interface OwnProps {
  actionId?: WritebackActionId;
  modelId?: number;
  databaseId?: number;
  onClose?: () => void;
}

interface StateProps {
  action?: WritebackQueryAction;
  question?: Question;
  metadata: Metadata;
}

interface DispatchProps {
  onCreateAction: (params: CreateQueryActionParams) => void;
  onUpdateAction: (params: UpdateQueryActionParams) => void;
}

type ActionCreatorProps = OwnProps & StateProps & DispatchProps;

const mapStateToProps = (
  state: State,
  { action }: { action: WritebackQueryAction },
) => ({
  action,
  question: action ? createQuestionFromAction(state, action) : undefined,
  metadata: getMetadata(state),
});

const mapDispatchToProps = {
  onCreateAction: Actions.actions.create,
  onUpdateAction: Actions.actions.update,
};

const EXAMPLE_QUERY =
  "UPDATE products\nSET rating = {{ my_new_value }}\nWHERE id = {{ my_primary_key }}";

function ActionCreatorComponent({
  action,
  question: passedQuestion,
  metadata,
  modelId,
  databaseId,
  onCreateAction,
  onUpdateAction,
  onClose,
}: ActionCreatorProps) {
  const [question, setQuestion] = useState(
    passedQuestion ?? newQuestion(metadata, databaseId),
  );

  const [formSettings, setFormSettings] = useState<ActionFormSettings>(
    getDefaultFormSettings(action?.visualization_settings),
  );

  const [showSaveModal, setShowSaveModal] = useState(false);

  useEffect(() => {
    setQuestion(passedQuestion ?? newQuestion(metadata, databaseId));

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

  const defaultModelId: number | undefined = useMemo(() => {
    if (modelId) {
      return modelId;
    }
    const params = new URLSearchParams(window.location.search);
    const modelQueryParam = params.get("model-id");
    return modelId ? Number(modelQueryParam) : undefined;
  }, [modelId]);

  if (!question || !metadata) {
    return null;
  }

  const query = question.query() as NativeQuery;

  const isNew = !action && !question.isSaved();

  const handleClickSave = () => {
    if (isNew) {
      setShowSaveModal(true);
    } else {
      const action = convertQuestionToAction(question, formSettings);
      onUpdateAction({ ...action, model_id: defaultModelId as number });
      onClose?.();
    }
  };

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

  const handleCloseNewActionModal = () => setShowSaveModal(false);

  const handleClickExample = () => {
    setQuestion(
      question.setQuery(query.setQueryText(query.queryText() + EXAMPLE_QUERY)),
    );
  };

  return (
    <>
      <ActionCreatorView
        isNew={isNew}
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
              model_id: defaultModelId,
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
    loadingAndErrorWrapper: false,
  }),
  Database.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(ActionCreatorComponent);
