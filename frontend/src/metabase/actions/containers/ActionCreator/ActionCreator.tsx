import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";
import { connect } from "react-redux";
import type { Route } from "react-router";

import Modal from "metabase/components/Modal";

import { LeaveConfirmationModal } from "metabase/components/LeaveConfirmationModal";
import useBeforeUnload from "metabase/hooks/use-before-unload";
import { useCallbackEffect } from "metabase/hooks/use-callback-effect";
import type {
  CreateActionParams,
  UpdateActionParams,
} from "metabase/entities/actions";
import Actions from "metabase/entities/actions";
import Database from "metabase/entities/databases";
import Questions from "metabase/entities/questions";
import { getMetadata } from "metabase/selectors/metadata";

import type {
  CardId,
  DatabaseId,
  WritebackActionId,
  WritebackAction,
  WritebackQueryAction,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import type Question from "metabase-lib/Question";
import type Metadata from "metabase-lib/metadata/Metadata";

import { isSavedAction } from "../../utils";
import ActionContext, { useActionContext } from "./ActionContext";
import { ACE_ELEMENT_ID } from "./ActionContext/QueryActionContextProvider";
import ActionCreatorView from "./ActionCreatorView";
import type { FormValues as CreateActionFormValues } from "./CreateActionForm";
import CreateActionForm from "./CreateActionForm";

interface OwnProps {
  actionId?: WritebackActionId;
  modelId?: CardId;
  databaseId?: DatabaseId;

  action?: WritebackAction;
  route: Route;

  onSubmit?: (action: WritebackAction) => void;
  onClose?: () => void;
}

interface ActionLoaderProps {
  initialAction?: WritebackAction;
}

interface ModelLoaderProps {
  model?: Question;
}

interface StateProps {
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

const mapStateToProps = (state: State) => ({
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
  route,
}: Props) {
  const {
    action,
    formSettings,
    isNew,
    canSave,
    isDirty,
    ui: UIProps,
    handleActionChange,
    handleFormSettingsChange,
    renderEditorBody,
  } = useActionContext();

  /**
   * Navigation is scheduled so that LeaveConfirmationModal's isEnabled
   * prop has a chance to re-compute on re-render
   */
  const [isCallbackScheduled, scheduleCallback] = useCallbackEffect();
  const [isSaveModalShown, setShowSaveModal] = useState(false);

  const isEditable = isNew || (model != null && model.canWriteActions());

  const showUnsavedChangesWarning =
    isEditable && isDirty && !isCallbackScheduled;

  useBeforeUnload(!route && showUnsavedChangesWarning);

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

    scheduleCallback(() => {
      onClose?.();
    });
  };

  const handleUpdate = async () => {
    if (isSavedAction(action)) {
      const reduxAction = await onUpdateAction({
        ...action,
        model_id: model?.id(),
        visualization_settings: formSettings,
      });

      const updatedAction = Actions.HACK_getObjectFromAction(reduxAction);
      onSubmit?.(updatedAction);

      scheduleCallback(() => {
        onClose?.();
      });
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
              model_id: model?.id(),
            }}
            onCreate={handleCreate}
            onCancel={handleCloseNewActionModal}
          />
        </Modal>
      )}

      {route && (
        <LeaveConfirmationModal
          isEnabled={showUnsavedChangesWarning}
          route={route}
        />
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
  action,
  ...props
}: Props) {
  // This is needed in case we already have an action and pass it from the outside
  const contextAction = action || initialAction;

  return (
    <ActionContext
      initialAction={contextAction}
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
    entityAlias: "model",
  }),
  Database.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(ActionCreatorWithContext);
