import React, { useState, useMemo, useEffect } from "react";
import { t } from "ttag";
import _ from "underscore";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import Button from "metabase/core/components/Button";
import Modal from "metabase/components/Modal";

import { useToggle } from "metabase/hooks/use-toggle";
import Actions, { ActionParams } from "metabase/entities/actions";
import Database from "metabase/entities/databases";
import { getMetadata } from "metabase/selectors/metadata";

import { createQuestionFromAction } from "metabase/actions/selectors";

import type {
  WritebackQueryAction,
  ActionFormSettings,
} from "metabase-types/api";
import type { State } from "metabase-types/store";
import type { SavedCard } from "metabase-types/types/Card";

import type NativeQuery from "metabase-lib/queries/NativeQuery";
import type Metadata from "metabase-lib/metadata/Metadata";
import type Question from "metabase-lib/Question";

import CreateActionForm from "../CreateActionForm";
import ActionCreatorHeader from "./ActionCreatorHeader";
import QueryActionEditor from "./QueryActionEditor";
import FormCreator from "./FormCreator";
import {
  DataReferenceTriggerButton,
  DataReferenceInline,
} from "./InlineDataReference";

import {
  ActionCreatorBodyContainer,
  EditorContainer,
  ModalRoot,
  ModalActions,
  ModalLeft,
} from "./ActionCreator.styled";

import { newQuestion, convertActionToQuestionCard } from "./utils";

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
  actionId?: number;
  question?: Question;
  metadata: Metadata;
}

interface DispatchProps {
  push: (url: string) => void;
  update: (action: ActionParams) => void;
}

type ActionCreatorProps = OwnProps & StateProps & DispatchProps;

function ActionCreatorComponent({
  metadata,
  question: passedQuestion,
  actionId,
  modelId,
  databaseId,
  update,
  onClose,
}: ActionCreatorProps) {
  const [question, setQuestion] = useState(
    passedQuestion ?? newQuestion(metadata, databaseId),
  );
  const [formSettings, setFormSettings] = useState<
    ActionFormSettings | undefined
  >(undefined);
  const [showSaveModal, setShowSaveModal] = useState(false);

  const [isDataRefOpen, { toggle: toggleDataRef, turnOff: closeDataRef }] =
    useToggle(false);

  useEffect(() => {
    setQuestion(passedQuestion ?? newQuestion(metadata, databaseId));

    // we do not want to update this any time the props or metadata change, only if action id changes
  }, [actionId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleSaveClick = () => {
    if (isNew) {
      setShowSaveModal(true);
    } else {
      update({
        id: question.id(),
        name: question.displayName() ?? "",
        description: question.description() ?? null,
        model_id: defaultModelId as number,
        formSettings: formSettings as ActionFormSettings,
        question,
      });
      onClose?.();
    }
  };

  const handleOnSave = (action: WritebackQueryAction) => {
    const actionCard = convertActionToQuestionCard(action);
    setQuestion(question.setCard(actionCard));
    setTimeout(() => setShowSaveModal(false), 1000);
    onClose?.();
  };

  const handleClose = () => setShowSaveModal(false);

  const handleExampleClick = () => {
    setQuestion(
      question.setQuery(query.setQueryText(query.queryText() + EXAMPLE_QUERY)),
    );
  };

  return (
    <>
      <Modal wide onClose={onClose}>
        <ModalRoot>
          <ActionCreatorBodyContainer>
            <ModalLeft>
              <DataReferenceTriggerButton onClick={toggleDataRef} />
              <ActionCreatorHeader
                type="query"
                name={question.displayName() ?? t`New Action`}
                onChangeName={newName =>
                  setQuestion(q => q.setDisplayName(newName))
                }
              />
              <EditorContainer>
                <QueryActionEditor
                  question={question}
                  setQuestion={setQuestion}
                />
              </EditorContainer>
              <ModalActions>
                <Button onClick={onClose} borderless>
                  {t`Cancel`}
                </Button>
                <Button
                  primary
                  disabled={query.isEmpty()}
                  onClick={handleSaveClick}
                >
                  {isNew ? t`Save` : t`Update`}
                </Button>
              </ModalActions>
            </ModalLeft>

            <DataReferenceInline
              isOpen={isDataRefOpen}
              onClose={closeDataRef}
            />

            {!isDataRefOpen && (
              <FormCreator
                params={question?.parameters() ?? []}
                formSettings={
                  question?.card()?.visualization_settings as ActionFormSettings
                }
                onChange={setFormSettings}
                onExampleClick={handleExampleClick}
              />
            )}
          </ActionCreatorBodyContainer>
        </ModalRoot>
      </Modal>
      {showSaveModal && (
        <Modal title={t`New Action`} onClose={handleClose}>
          <CreateActionForm
            question={question}
            formSettings={formSettings as ActionFormSettings}
            modelId={defaultModelId}
            onCreate={handleOnSave}
            onCancel={handleClose}
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
