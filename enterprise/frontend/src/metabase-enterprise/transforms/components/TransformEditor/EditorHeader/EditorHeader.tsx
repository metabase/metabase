import { t } from "ttag";

import Button from "metabase/common/components/Button";
import EditBar from "metabase/common/components/EditBar";
import { Tooltip } from "metabase/ui";

import type { ValidationResult } from "./types";

type EditorHeaderProps = {
  name?: string;
  validationResult: ValidationResult;
  isNew: boolean;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export function EditorHeader({
  name,
  validationResult,
  isNew,
  isDirty,
  isSaving,
  onSave,
  onCancel,
}: EditorHeaderProps) {
  const canSave = (isNew || isDirty) && !isSaving && validationResult.isValid;

  return (
    <EditBar
      title={getTitle(name, isNew)}
      admin
      buttons={[
        <Button key="cancel" small onClick={onCancel}>{t`Cancel`}</Button>,
        <Tooltip
          key="save"
          label={validationResult.errorMessage}
          disabled={validationResult.errorMessage == null}
        >
          <Button onClick={onSave} primary small disabled={!canSave}>
            {getSaveButtonLabel(isNew, isSaving)}
          </Button>
        </Tooltip>,
      ]}
    />
  );
}

function getTitle(name: string | undefined, isNew: boolean) {
  if (isNew) {
    return t`You're creating a new transform`;
  } else {
    return t`You’re editing the "${name}" transform`;
  }
}

function getSaveButtonLabel(isNew: boolean, isSaving: boolean) {
  if (isSaving) {
    return isNew ? t`Saving` : t`Saving changes`;
  } else {
    return isNew ? t`Save` : t`Save changes`;
  }
}
