import { useState } from "react";
import { t } from "ttag";

import { useCreateActionMutation, useUpdateActionMutation } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { useBeforeUnload } from "metabase/common/hooks/use-before-unload";
import { useCallbackEffect } from "metabase/common/hooks/use-callback-effect";
import { useToast } from "metabase/common/hooks/use-toast";
import { Modal } from "metabase/ui";
import type { CardId, WritebackAction } from "metabase-types/api";

import { isSavedAction } from "../../utils";

import { useActionContext } from "./ActionContext";
import ActionCreatorView from "./ActionCreatorView";
import type { FormValues as CreateActionFormValues } from "./CreateActionForm";
import CreateActionForm from "./CreateActionForm";
import type { DataReferenceSlot } from "./types";

export interface ActionCreatorProps {
  modelId?: CardId;
  /** Whether the model accepts new actions, i.e. `Question.canWriteActions`. */
  canWriteModelActions?: boolean;
  /**
   * Whether the creator is mounted as its own route. A routed creator guards
   * leaving with `LeaveRouteConfirmModal`; an inline one only has `beforeunload`.
   */
  isRouted?: boolean;
  dataReference: DataReferenceSlot;

  onSubmit?: (action: WritebackAction) => void;
  onClose?: () => void;
}

export function ActionCreator({
  modelId,
  canWriteModelActions = false,
  isRouted,
  dataReference,
  onSubmit,
  onClose,
}: ActionCreatorProps) {
  const [createAction] = useCreateActionMutation();
  const [updateAction] = useUpdateActionMutation();
  const [sendToast] = useToast();
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

  const isEditable = isNew || canWriteModelActions;

  const showUnsavedChangesWarning =
    isEditable && isDirty && !isCallbackScheduled;

  useBeforeUnload(!isRouted && showUnsavedChangesWarning);

  const handleCreate = async (values: CreateActionFormValues) => {
    if (action.type !== "query") {
      return; // only query action creation is supported now
    }

    try {
      const createdAction = await createAction({
        ...action,
        ...values,
        visualization_settings: formSettings,
      }).unwrap();

      // Sync the editor state with data from save modal form
      handleActionChange(values);

      setShowSaveModal(false);
      onSubmit?.(createdAction);

      scheduleCallback(() => {
        onClose?.();
      });
    } catch (_error) {
      sendToast({ icon: "warning", message: t`Failed to create action` });
    }
  };

  const handleUpdate = async () => {
    if (!isSavedAction(action)) {
      return;
    }

    try {
      const updatedAction = await updateAction({
        ...action,
        model_id: modelId,
        visualization_settings: formSettings,
      }).unwrap();

      onSubmit?.(updatedAction);

      scheduleCallback(() => {
        onClose?.();
      });
    } catch (_error) {
      sendToast({ icon: "warning", message: t`Failed to update action` });
    }
  };

  const showSaveModal = () => {
    setShowSaveModal(true);
  };

  const handleClickSave = () => {
    if (isNew) {
      showSaveModal();
    } else {
      void handleUpdate();
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
        dataReference={dataReference}
        onChangeAction={handleActionChange}
        onChangeFormSettings={handleFormSettingsChange}
        onClickSave={handleClickSave}
        onCloseModal={onClose}
      >
        {renderEditorBody({ isEditable })}
      </ActionCreatorView>
      <Modal
        opened={isSaveModalShown}
        title={t`New Action`}
        onClose={handleCloseNewActionModal}
      >
        <CreateActionForm
          initialValues={{
            name: action.name,
            description: action.description,
            model_id: modelId,
          }}
          onCreate={handleCreate}
          onCancel={handleCloseNewActionModal}
        />
      </Modal>

      {isRouted && (
        <LeaveRouteConfirmModal isEnabled={showUnsavedChangesWarning} />
      )}
    </>
  );
}
