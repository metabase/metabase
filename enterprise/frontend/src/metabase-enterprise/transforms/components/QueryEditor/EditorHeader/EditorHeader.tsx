import { t } from "ttag";

import { TransformHeader } from "../../TransformHeader";
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
  isNew,
  isQueryDirty,
  isSaving,
  hasProposedQuery,
  onSave,
  onCancel,
}: EditorHeaderProps) {
  const hasButtons = isNew || isQueryDirty || hasProposedQuery;
  const canSave = validationResult.isValid && !isSaving;

  return (
    <TransformHeader
      canSave={canSave}
      hasButtons={hasButtons}
      saveButtonLabel={getSaveButtonLabel(isNew, isSaving)}
      saveButtonTooltip={validationResult.errorMessage}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
}

function getSaveButtonLabel(isNew: boolean, isSaving: boolean) {
  if (isSaving) {
    return isNew ? t`Saving` : t`Saving changes`;
  } else {
    return isNew ? t`Save` : t`Save changes`;
  }
}
