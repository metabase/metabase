import { t } from "ttag";

import { BenchPaneHeader } from "metabase/bench/components/BenchPaneHeader";
import { Button, Group, Tooltip } from "metabase/ui";
import type { Transform } from "metabase-types/api";

import { TransformTabs } from "../../TransformTabs";
import type { QueryValidationResult } from "../types";

type EditorHeaderProps = {
  transform?: Transform;
  validationResult: QueryValidationResult;
  isNew: boolean;
  isQueryDirty: boolean;
  isSaving: boolean;
  hasProposedQuery: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export function EditorHeader({
  transform,
  validationResult,
  isNew,
  isQueryDirty,
  isSaving,
  hasProposedQuery,
  onSave,
  onCancel,
}: EditorHeaderProps) {
  const hasButtons = isNew || isQueryDirty || hasProposedQuery;
  const canSave = validationResult.isValid && !isSaving;

  return (
    <BenchPaneHeader
      title={transform && <TransformTabs transform={transform} />}
      actions={
        <Group>
          {hasButtons && <Button onClick={onCancel}>{t`Cancel`}</Button>}
          {hasButtons && (
            <Tooltip
              label={validationResult.errorMessage}
              disabled={validationResult.errorMessage == null}
            >
              <Button onClick={onSave} variant="filled" disabled={!canSave}>
                {getSaveButtonLabel(isNew, isSaving)}
              </Button>
            </Tooltip>
          )}
        </Group>
      }
      withBorder
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
