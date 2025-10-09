import { t } from "ttag";

import Button from "metabase/common/components/Button";
import EditBar from "metabase/common/components/EditBar";
import { Checkbox, Flex, Modal, Text, Tooltip } from "metabase/ui";

import type { QueryValidationResult } from "../types";

type EditorHeaderProps = {
  validationResult: QueryValidationResult;
  isNew: boolean;
  isQueryDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
  transformId?: number;
  isIncremental?: boolean;
  onIncrementalChange?: (incremental: boolean) => void;
};

export function EditorHeader({
  validationResult,
  isNew,
  isQueryDirty,
  isSaving,
  onSave,
  onCancel,
  transformId,
  isIncremental = false,
  onIncrementalChange,
}: EditorHeaderProps) {
  const canSave =
    (isNew || isQueryDirty) && validationResult.isValid && !isSaving;

  const handleIncrementalToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const checked = event.currentTarget.checked;

    if (isNew) {
      // For new transforms, update the state and trigger save modal if checking
      if (onIncrementalChange) {
        onIncrementalChange(checked);
      }
      if (checked) {
        // Show alert about needing to save first
        alert(
          t`You need to save the transform first before enabling incremental mode. The save dialog will open now.`,
        );
        // Trigger the save modal
        onSave();
      }
    } else if (onIncrementalChange) {
      // For existing transforms, toggle the incremental mode
      onIncrementalChange(checked);
    }
  };

  return (
    <EditBar
      title={
        <Flex align="center" gap="md">
          {getTitle(isNew)}
          <Checkbox
            label={t`Incremental?`}
            checked={isIncremental}
            onChange={handleIncrementalToggle}
          />
          {isIncremental && transformId && (
            <Text size="sm" c="text-medium">
              {t`Current Transform ID: ${transformId}`}
            </Text>
          )}
        </Flex>
      }
      admin
      buttons={[
        <Button key="cancel" small onClick={onCancel}>{t`Cancel`}</Button>,
        <Tooltip
          key="save"
          label={validationResult.errorMessage}
          disabled={validationResult.errorMessage == null}
        >
          <Button onClick={onSave} primary small disabled={!canSave}>
            {getSaveButtonLabel(isNew, isSaving)}
          </Button>
        </Tooltip>,
      ]}
    />
  );
}

function getTitle(isNew: boolean) {
  if (isNew) {
    return t`You're creating a new transform`;
  } else {
    return t`You're editing a transform`;
  }
}

function getSaveButtonLabel(isNew: boolean, isSaving: boolean) {
  if (isSaving) {
    return isNew ? t`Saving` : t`Saving changes`;
  } else {
    return isNew ? t`Save` : t`Save changes`;
  }
}
