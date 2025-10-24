import { t } from "ttag";

import { BenchPaneHeader } from "metabase/bench/components/BenchPaneHeader";
import { BenchTabs } from "metabase/bench/components/shared/BenchTabs";
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
    <BenchPaneHeader
      title={
        <BenchTabs tabs={[{ label: t`Query`, to: `/bench/transforms/1` }]} />
      }
      actions={
        <Group>
          <Button onClick={onCancel}>{t`Cancel`}</Button>
          <Tooltip
            label={validationResult.errorMessage}
            disabled={validationResult.errorMessage == null}
          >
            <Button onClick={onSave} variant="filled" disabled={!canSave}>
              {getSaveButtonLabel(isNew, isSaving)}
            </Button>
          </Tooltip>
        </Group>
      }
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
