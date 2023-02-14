import React, { useState } from "react";
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
  Card,
  WritebackActionId,
  WritebackQueryAction,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import type Metadata from "metabase-lib/metadata/Metadata";

import { isSavedAction } from "../../utils";
import ActionContext, { useActionContext } from "./ActionContext";
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
  initialAction?: WritebackQueryAction;
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

function ActionCreator({
  model,
  metadata,
  onCreateAction,
  onUpdateAction,
  onClose,
}: Props) {
  const {
    action,
    formSettings,
    isNew,
    canSave,
    handleActionChange,
    handleFormSettingsChange,
    handleSetupExample,
    renderEditorBody,
  } = useActionContext();

  const [showSaveModal, setShowSaveModal] = useState(false);

  const isEditable = model.canWriteActions();

  const handleCreate = async (values: CreateActionFormValues) => {
    await onCreateAction({
      ...action,
      ...values,
      type: "query",
    } as WritebackQueryAction);

    // Sync the editor state with data from save modal form
    handleActionChange(values);

    setShowSaveModal(false);
    onClose?.();
  };

  const handleUpdate = () => {
    if (isSavedAction(action)) {
      onUpdateAction({ ...action, model_id: model.id() });
    }
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

  if (!metadata) {
    return null;
  }

  return (
    <>
      <ActionCreatorView
        action={action}
        formSettings={formSettings}
        canSave={canSave}
        isNew={isNew}
        isEditable={isEditable}
        onChangeAction={handleActionChange}
        onChangeFormSettings={handleFormSettingsChange}
        onClickSave={handleClickSave}
        onClickExample={handleSetupExample}
        onCloseModal={onClose}
      >
        {renderEditorBody({ isEditable })}
      </ActionCreatorView>
      {showSaveModal && (
        <Modal title={t`New Action`} onClose={handleCloseNewActionModal}>
          <CreateActionForm
            initialValues={{
              name: action.name,
              description: action.description,
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

function ActionCreatorWithContext({
  initialAction,
  metadata,
  databaseId,
  ...props
}: Props) {
  return (
    <ActionContext
      initialAction={initialAction}
      databaseId={databaseId}
      metadata={metadata}
    >
      <ActionCreator
        {...props}
        initialAction={initialAction}
        databaseId={databaseId}
        metadata={metadata}
      />
    </ActionContext>
  );
}

export default _.compose(
  Actions.load({
    id: (state: State, props: OwnProps) => props.actionId,
    loadingAndErrorWrapper: false,
    entityAlias: "initialAction",
  }),
  Questions.load({
    id: (state: State, props: OwnProps) => props.modelId,
    entityAlias: "modelCard",
  }),
  Database.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(ActionCreatorWithContext);
