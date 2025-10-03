import { t } from "ttag";

import { Button, Group, Tooltip } from "metabase/ui";

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
  const canSave =
    (isNew || isQueryDirty || hasProposedQuery) &&
    validationResult.isValid &&
    !isSaving;

  return (
    <Group justify="flex-end" p="sm"
      style={{ zIndex: 24 /* FIXME: silly hack for prototyping */ }}
      w="100%"
    >
      <Button key="cancel" onClick={onCancel} size="compact-sm">{t`Cancel`}</Button>
      <Tooltip
        key="save"
        label={validationResult.errorMessage}
        disabled={validationResult.errorMessage == null}
      >
        <Button onClick={onSave} variant="filled" disabled={!canSave} size="compact-sm">
          {getSaveButtonLabel(isNew, isSaving)}
        </Button>
      </Tooltip>
    </Group>
  );
}

function getSaveButtonLabel(isNew: boolean, isSaving: boolean) {
  if (isSaving) {
    return isNew ? t`Saving` : t`Saving changes`;
  } else {
    return isNew ? t`Save` : t`Save changes`;
  }
}
