import type { CardId } from "metabase-types/api";

import { EntityEditorActions } from "../../EntityEditorActions";
import { MetricHeader } from "../../MetricHeader";
import type { ValidationResult } from "../../types";

type EditorHeaderProps = {
  id?: CardId;
  name: string;
  validationResult: ValidationResult;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
  onChangeName?: (name: string) => void;
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
  return (
    <MetricHeader
      id={id}
      name={name}
      actions={
        <EntityEditorActions
          validationResult={validationResult}
          isDirty={isDirty}
          isSaving={isSaving}
          onSave={onSave}
          onCancel={onCancel}
        />
      }
      onChangeName={onChangeName}
    />
  );
}
