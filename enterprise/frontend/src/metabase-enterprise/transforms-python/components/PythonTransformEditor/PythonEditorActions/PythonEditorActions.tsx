import { t } from "ttag";

import { Button, Group, Tooltip } from "metabase/ui";
import type { PythonTransformSourceDraft } from "metabase-types/api";

import { getValidationResult } from "./utils";

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
