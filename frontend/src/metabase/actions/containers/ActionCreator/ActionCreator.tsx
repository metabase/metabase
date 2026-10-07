import { useCallback, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useUpdateActionMutation } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { useBeforeUnload } from "metabase/common/hooks/use-before-unload";
import { useCallbackEffect } from "metabase/common/hooks/use-callback-effect";
import { useToast } from "metabase/common/hooks/use-toast";
import type {
  ActionFormSettings,
  WritebackAction,
  WritebackImplicitQueryAction,
} from "metabase-types/api";

import { getDefaultFormSettings } from "../../utils";

import ActionCreatorView from "./ActionCreatorView";

export interface ActionCreatorProps {
  action: WritebackImplicitQueryAction;
  /** Whether the model accepts new actions, i.e. `Question.canWriteActions`. */
  canWriteModelActions?: boolean;
  /**
   * Whether the creator is mounted as its own route. A routed creator guards
   * leaving with `LeaveRouteConfirmModal`; an inline one only has `beforeunload`.
   */
  isRouted?: boolean;

  onSubmit?: (action: WritebackAction) => void;
  onClose?: () => void;
}

export function ActionCreator({
  action,
  canWriteModelActions = false,
  isRouted,
  onSubmit,
  onClose,
}: ActionCreatorProps) {
  const [updateAction] = useUpdateActionMutation();
  const [sendToast] = useToast();
  const [formSettings, setFormSettings] = useState(() =>
    getDefaultFormSettings(action.visualization_settings),
  );

  /**
   * Navigation is scheduled so that LeaveConfirmationModal's isEnabled
   * prop has a chance to re-compute on re-render
   */
  const [isCallbackScheduled, scheduleCallback] = useCallbackEffect();

  const isDirty = !_.isEqual(
    formSettings,
    getDefaultFormSettings(action.visualization_settings),
  );
  const showUnsavedChangesWarning =
    canWriteModelActions && isDirty && !isCallbackScheduled;

  useBeforeUnload(!isRouted && showUnsavedChangesWarning);

  const handleFormSettingsChange = useCallback(
    (nextFormSettings: ActionFormSettings) => {
      setFormSettings(getDefaultFormSettings(nextFormSettings));
    },
    [],
  );

  const handleUpdate = async () => {
    try {
      const updatedAction = await updateAction({
        id: action.id,
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

  return (
    <>
      <ActionCreatorView
        action={action}
        formSettings={formSettings}
        canSave={isDirty}
        isEditable={canWriteModelActions}
        onChangeFormSettings={handleFormSettingsChange}
        onClickSave={handleUpdate}
        onCloseModal={onClose}
      />
      {isRouted && (
        <LeaveRouteConfirmModal isEnabled={showUnsavedChangesWarning} />
      )}
    </>
  );
}
