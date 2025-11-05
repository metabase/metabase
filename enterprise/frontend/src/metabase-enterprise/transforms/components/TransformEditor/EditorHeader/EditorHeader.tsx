import { PaneHeaderActions } from "metabase/data-studio/components/PaneHeader";
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
    <TransformHeader
      id={id}
      name={name}
      actions={
        <PaneHeaderActions
          validationResult={validationResult}
          isDirty={isDirty}
          isSaving={isSaving}
          onSave={onSave}
          onCancel={onCancel}
        />
      }
      hasMenu={!isDirty}
      onChangeName={onChangeName}
    />
  );
}
