import { t } from "ttag";

import { Button, Group, Tooltip } from "metabase/ui";

import type { ValidationResult } from "../types";

type EntityEditorActionsProps = {
  validationResult: ValidationResult;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export function EntityEditorActions({
  validationResult,
  isDirty,
  isSaving,
  onSave,
  onCancel,
}: EntityEditorActionsProps) {
  const canSave = isDirty && !isSaving && validationResult.isValid;

  if (!isDirty) {
    return null;
  }

  return (
    <Group>
      <Button onClick={onCancel}>{t`Cancel`}</Button>
      <Tooltip
        label={validationResult.errorMessage}
        disabled={validationResult.errorMessage == null}
      >
        <Button variant="filled" disabled={!canSave} onClick={onSave}>
          {t`Save`}
        </Button>
      </Tooltip>
    </Group>
  );
}
