import { t } from "ttag";

import { Button, Group } from "metabase/ui";

type PythonEditorActionsProps = {
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export function PythonEditorActions({
  isSaving,
  onSave,
  onCancel,
}: PythonEditorActionsProps) {
  return (
    <Group>
      <Button onClick={onCancel}>{t`Cancel`}</Button>
      <Button variant="filled" disabled={isSaving} onClick={onSave}>
        {t`Save`}
      </Button>
    </Group>
  );
}
