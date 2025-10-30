import { t } from "ttag";

import { Button, Group, Tooltip } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { getValidationResult } from "./utils";

type EditorActionsProps = {
  query: Lib.Query;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export function EditorActions({
  query,
  isSaving,
  onSave,
  onCancel,
}: EditorActionsProps) {
  const { isValid, errorMessage } = getValidationResult(query);

  return (
    <Group>
      <Button size="sm" onClick={onCancel}>{t`Cancel`}</Button>
      <Tooltip label={errorMessage} disabled={errorMessage == null}>
        <Button
          variant="filled"
          size="sm"
          disabled={!isValid || isSaving}
          onClick={onSave}
        >
          {t`Save`}
        </Button>
      </Tooltip>
    </Group>
  );
}
