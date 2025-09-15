import { t } from "ttag";

import Button from "metabase/common/components/Button";
import EditBar from "metabase/common/components/EditBar";
import { Tooltip } from "metabase/ui";

import type { QueryValidationResult } from "../types";

type EditorHeaderProps = {
  validationResult: QueryValidationResult;
  isNew: boolean;
  isQueryDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export function EditorHeader({
  validationResult,
  isNew,
  isQueryDirty,
  isSaving,
  onSave,
  onCancel,
}: EditorHeaderProps) {
  const canSave = canSaveTransform(
    validationResult,
    isNew,
    isQueryDirty,
    isSaving,
  );

  return (
    <EditBar
      title={getTitle(isNew)}
      admin
      buttons={[
        <Button key="cancel" small onClick={onCancel}>{t`Cancel`}</Button>,
        <Tooltip
          key="save"
          label={validationResult.message}
          disabled={validationResult.message == null}
        >
          <Button onClick={onSave} primary small disabled={!canSave}>
            {getSaveButtonLabel(isNew, isSaving)}
          </Button>
        </Tooltip>,
      ]}
    />
  );
}

function getTitle(isNew: boolean) {
  if (isNew) {
    return t`You’re creating a new transform`;
  } else {
    return t`You’re editing a transform`;
  }
}

function getSaveButtonLabel(isNew: boolean, isSaving: boolean) {
  if (isSaving) {
    return isNew ? t`Saving` : t`Saving changes`;
  } else {
    return isNew ? t`Save` : t`Save changes`;
  }
}

function canSaveTransform(
  validationResult: QueryValidationResult,
  isNew: boolean,
  isQueryDirty: boolean,
  isSaving: boolean,
) {
  return (isNew || isQueryDirty) && !isSaving && validationResult.isValid;
}
