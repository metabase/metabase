import { t } from "ttag";

import { Button, Group, Tooltip } from "metabase/ui";
import type { PythonTransformSourceDraft } from "metabase-types/api";

type PythonEditorActionsProps = {
  source: PythonTransformSourceDraft;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export function PythonEditorActions({
  source,
  isSaving,
  onSave,
  onCancel,
}: PythonEditorActionsProps) {
  const { isValid, errorMessage } = getValidationResult(source);

  return (
    <Group>
      <Button onClick={onCancel}>{t`Cancel`}</Button>
      <Tooltip label={errorMessage} disabled={errorMessage == null}>
        <Button
          variant="filled"
          disabled={!isValid || isSaving}
          onClick={onSave}
        >
          {t`Save`}
        </Button>
      </Tooltip>
    </Group>
  );
}

type ValidationResult = {
  isValid: boolean;
  errorMessage?: string;
};

function getValidationResult(
  source: PythonTransformSourceDraft,
): ValidationResult {
  if (!source["source-database"]) {
    return { isValid: false, errorMessage: t`Select a source a database` };
  }

  if (source.body.trim() === "") {
    return {
      isValid: false,
      errorMessage: t`The Python script cannot be empty`,
    };
  }

  if (Object.keys(source["source-tables"]).length === 0) {
    return {
      isValid: false,
      errorMessage: t`Select at least one table to alias`,
    };
  }

  return { isValid: true };
}
