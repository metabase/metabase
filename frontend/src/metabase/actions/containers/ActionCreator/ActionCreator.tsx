import React, { useState } from "react";
import { t } from "ttag";
import _ from "underscore";
import { connect } from "react-redux";

import Modal from "metabase/components/Modal";

import Actions, {
  CreateActionParams,
  UpdateActionParams,
} from "metabase/entities/actions";
import Database from "metabase/entities/databases";
import Questions from "metabase/entities/questions";
import { getMetadata } from "metabase/selectors/metadata";

import type {
  Card,
  CardId,
  DatabaseId,
  WritebackActionId,
  WritebackAction,
  WritebackQueryAction,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import Question from "metabase-lib/Question";
import type Metadata from "metabase-lib/metadata/Metadata";

import { isSavedAction } from "../../utils";
import ActionContext, { useActionContext } from "./ActionContext";
import { ACE_ELEMENT_ID } from "./ActionContext/QueryActionContextProvider";
import ActionCreatorView from "./ActionCreatorView";
import CreateActionForm, {
  FormValues as CreateActionFormValues,
} from "./CreateActionForm";

interface OwnProps {
  actionId?: WritebackActionId;
  modelId?: CardId;
  databaseId?: DatabaseId;
  onSubmit?: (action: WritebackAction) => void;
  onClose?: () => void;
}

interface ActionLoaderProps {
  initialAction?: WritebackAction;
}

interface ModelLoaderProps {
  modelCard: Card;
}

interface StateProps {
  model: Question;
  metadata: Metadata;
}

interface DispatchProps {
  onCreateAction: (params: CreateActionParams) => void;
  onUpdateAction: (params: UpdateActionParams) => void;
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
  onCreateAction,
  onUpdateAction,
  onSubmit,
  onClose,
}: Props) {
  const {
    action,
    formSettings,
    isNew,
    canSave,
    ui: UIProps,
    handleActionChange,
    handleFormSettingsChange,
    renderEditorBody,
  } = useActionContext();

  const [isSaveModalShown, setShowSaveModal] = useState(false);

  const isEditable = isNew || model.canWriteActions();

  const handleCreate = async (values: CreateActionFormValues) => {
    if (action.type !== "query") {
      return; // only query action creation is supported now
    }

    const reduxAction = await onCreateAction({
      ...action,
      ...values,
      visualization_settings: formSettings,
    } as WritebackQueryAction);
    const createdAction = Actions.HACK_getObjectFromAction(reduxAction);

    // Sync the editor state with data from save modal form
    handleActionChange(values);

    setShowSaveModal(false);
    onSubmit?.(createdAction);
    onClose?.();
  };

  const handleUpdate = async () => {
    if (isSavedAction(action)) {
      const reduxAction = await onUpdateAction({
        ...action,
        model_id: model.id(),
        visualization_settings: formSettings,
      });
      const updatedAction = Actions.HACK_getObjectFromAction(reduxAction);
      onSubmit?.(updatedAction);
    }
  };

  const showSaveModal = () => {
    ensureAceEditorClosed();
    setShowSaveModal(true);
  };

  const handleClickSave = () => {
    if (isNew) {
      showSaveModal();
    } else {
      handleUpdate();
      onClose?.();
    }
  };

  const handleCloseNewActionModal = () => setShowSaveModal(false);

  return (
    <>
      <ActionCreatorView
        {...UIProps}
        action={action}
        formSettings={formSettings}
        canSave={canSave}
        isNew={isNew}
        isEditable={isEditable}
        onChangeAction={handleActionChange}
        onChangeFormSettings={handleFormSettingsChange}
        onClickSave={handleClickSave}
        onCloseModal={onClose}
      >
        {renderEditorBody({ isEditable })}
      </ActionCreatorView>
      {isSaveModalShown && (
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

function ensureAceEditorClosed() {
  // @ts-expect-error — `ace` isn't typed yet
  const editor = window.ace?.edit(ACE_ELEMENT_ID);
  editor?.completer?.popup?.hide();
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Actions.load({
    id: (state: State, props: OwnProps) => props.actionId,
    loadingAndErrorWrapper: false,
    entityAlias: "initialAction",
  }),
  Questions.load({
    id: (state: State, props: OwnProps) => props?.modelId,
    entityAlias: "modelCard",
  }),
  Database.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(ActionCreatorWithContext);
