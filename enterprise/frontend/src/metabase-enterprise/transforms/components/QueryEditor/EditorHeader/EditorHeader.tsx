import { t } from "ttag";

import Button from "metabase/common/components/Button";
import EditBar from "metabase/common/components/EditBar";
import { Tooltip } from "metabase/ui";

import type { QueryValidationResult } from "../types";

type EditorHeaderProps = {
  validationResult: QueryValidationResult;
  name?: string;
  isNew: boolean;
  isQueryDirty: boolean;
  isSaving: boolean;
  hasProposedQuery: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export function EditorHeader({
  validationResult,
  name,
  isNew,
  isQueryDirty,
  isSaving,
  hasProposedQuery,
  onSave,
  onCancel,
}: EditorHeaderProps) {
  const canSave =
    (isNew || isQueryDirty || hasProposedQuery) &&
    validationResult.isValid &&
    !isSaving;

  return (
    <EditBar
      title={getTitle(isNew, name)}
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

function getTitle(isNew: boolean, name?: string) {
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
