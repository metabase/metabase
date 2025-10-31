import { t } from "ttag";

import { Button, Group, Tooltip } from "metabase/ui";
import type { TransformId } from "metabase-types/api";

import { TransformHeader } from "../../TransformHeader";

import type { ValidationResult } from "./types";

type EditorHeaderProps = {
  id?: TransformId;
  name: string;
  validationResult: ValidationResult;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
  onChangeName: (name: string) => void;
};

export function EditorHeader({
  id,
  name,
  validationResult,
  isDirty,
  isSaving,
  onSave,
  onCancel,
  onChangeName,
}: EditorHeaderProps) {
  const canSave = isDirty && !isSaving && validationResult.isValid;

  return (
    <TransformHeader
      id={id}
      name={name}
      actions={
        isDirty && (
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
        )
      }
      onChangeName={onChangeName}
    />
  );
}
