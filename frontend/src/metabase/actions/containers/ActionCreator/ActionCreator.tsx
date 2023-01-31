import React, { useState, useMemo, useEffect, useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import Modal from "metabase/components/Modal";

import Actions, {
  CreateQueryActionParams,
  UpdateQueryActionParams,
} from "metabase/entities/actions";
import Database from "metabase/entities/databases";
import { getMetadata } from "metabase/selectors/metadata";

import { createQuestionFromAction } from "metabase/actions/selectors";

import type {
  WritebackQueryAction,
  ActionFormSettings,
  WritebackActionId,
} from "metabase-types/api";
import type { State } from "metabase-types/store";
import type { SavedCard } from "metabase-types/types/Card";

import { getUserIsAdmin } from "metabase/selectors/user";
import { getSetting } from "metabase/selectors/settings";
import type NativeQuery from "metabase-lib/queries/NativeQuery";
import type Metadata from "metabase-lib/metadata/Metadata";
import type Question from "metabase-lib/Question";

import { getTemplateTagParametersFromCard } from "metabase-lib/parameters/utils/template-tags";
import CreateActionForm from "../CreateActionForm";

import { newQuestion, convertQuestionToAction } from "./utils";
import ActionCreatorView from "./ActionCreatorView";

const mapStateToProps = (
  state: State,
  { action }: { action: WritebackQueryAction },
) => ({
  metadata: getMetadata(state),
  question: action ? createQuestionFromAction(state, action) : undefined,
  actionId: action ? action.id : undefined,
  isAdmin: getUserIsAdmin(state),
  isPublicSharingEnabled: getSetting(state, "enable-public-sharing"),
});

const mapDispatchToProps = {
  push,
  create: Actions.actions.create,
  update: Actions.actions.update,
};

const EXAMPLE_QUERY =
  "UPDATE products\nSET rating = {{ my_new_value }}\nWHERE id = {{ my_primary_key }}";

interface OwnProps {
  modelId?: number;
  databaseId?: number;
  onClose?: () => void;
}

interface StateProps {
  actionId?: WritebackActionId;
  question?: Question;
  metadata: Metadata;
  isAdmin: boolean;
  isPublicSharingEnabled: boolean;
}

interface DispatchProps {
  push: (url: string) => void;
  create: (action: CreateQueryActionParams) => void;
  update: (action: UpdateQueryActionParams) => void;
}

type ActionCreatorProps = OwnProps & StateProps & DispatchProps;

function ActionCreatorComponent({
  metadata,
  question: passedQuestion,
  actionId,
  modelId,
  databaseId,
  create,
  update,
  onClose,
  isAdmin,
  isPublicSharingEnabled,
}: ActionCreatorProps) {
  const [question, setQuestion] = useState(
    passedQuestion ?? newQuestion(metadata, databaseId),
  );
  const [formSettings, setFormSettings] = useState<ActionFormSettings>({
    type: "button",
    fields: {},
  });
  const [showSaveModal, setShowSaveModal] = useState(false);

  useEffect(() => {
    setQuestion(passedQuestion ?? newQuestion(metadata, databaseId));

    // we do not want to update this any time the props or metadata change, only if action id changes
  }, [actionId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const isNew = !actionId && !(question.card() as SavedCard).id;

  const handleClickSave = () => {
    if (isNew) {
      setShowSaveModal(true);
    } else {
      const action = convertQuestionToAction(question, formSettings);
      update({ ...action, model_id: defaultModelId as number });
      onClose?.();
    }
  };

  const handleCreate = async (values: any) => {
    await create({
      ...convertQuestionToAction(question, formSettings),
      ...values,
      type: "query",
    });
    const nextQuestion = question
      .setDisplayName(values.name)
      .setDescription(values.description);
    setQuestion(nextQuestion);
    setTimeout(() => setShowSaveModal(false), 1000);
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
        hasSharingPermission={isAdmin && isPublicSharingEnabled}
        canSave={query.isEmpty()}
        actionId={actionId}
        question={question}
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
    id: (state: State, props: { actionId?: number }) => props.actionId,
    loadingAndErrorWrapper: false,
  }),
  Database.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(ActionCreatorComponent);
