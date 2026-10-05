import { t } from "ttag";

import { useUpdateActionMutation } from "metabase/api";
import { PaneHeaderInput } from "metabase/common/data-studio/components/PaneHeader";
import { useMetadataToasts } from "metabase/common/hooks";
import type { WritebackAction } from "metabase-types/api";

import { ACTION_NAME_MAX_LENGTH } from "../../constants";

type ActionNameInputProps = {
  action: WritebackAction;
  readOnly?: boolean;
};

export function ActionNameInput({ action, readOnly }: ActionNameInputProps) {
  const [updateAction] = useUpdateActionMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleChangeName = async (name: string) => {
    const { error } = await updateAction({ id: action.id, name });
    if (error) {
      sendErrorToast(t`Failed to update action name`);
    } else {
      sendSuccessToast(t`Action name updated`);
    }
  };

  return (
    <PaneHeaderInput
      initialValue={action.name}
      maxLength={ACTION_NAME_MAX_LENGTH}
      readOnly={readOnly}
      onChange={handleChangeName}
    />
  );
}
