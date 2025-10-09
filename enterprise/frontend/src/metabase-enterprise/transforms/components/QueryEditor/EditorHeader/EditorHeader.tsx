import { useState } from "react";
import { t } from "ttag";

import Button from "metabase/common/components/Button";
import EditBar from "metabase/common/components/EditBar";
import { Checkbox, Flex, Modal, Text, TextInput, Tooltip } from "metabase/ui";

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
  onIncrementalChange?: (incremental: boolean, watermarkField?: string) => void;
  watermarkField?: string | null;
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
  watermarkField,
}: EditorHeaderProps) {
  const [localWatermarkField, setLocalWatermarkField] = useState(watermarkField || "");

  // Block saving if incremental is enabled but no watermark field is set
  const hasWatermarkFieldIfNeeded = !isIncremental || localWatermarkField.trim() !== "";
  const canSave =
    (isNew || isQueryDirty) &&
    validationResult.isValid &&
    !isSaving &&
    hasWatermarkFieldIfNeeded;

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
      if (checked && !localWatermarkField.trim()) {
        // If enabling incremental but no watermark field, don't call the handler yet
        // Just show an alert and don't actually toggle
        alert(
          t`Please enter a watermark field before enabling incremental mode.`,
        );
        // Prevent the checkbox from being checked
        event.preventDefault();
        return;
      }
      // Only call the handler if we have a watermark field (or if unchecking)
      onIncrementalChange(checked, localWatermarkField);
    }
  };

  const handleWatermarkFieldChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value;
    setLocalWatermarkField(value);
    if (onIncrementalChange && isIncremental) {
      onIncrementalChange(true, value);
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
          {isIncremental && !isNew && (
            <TextInput
              placeholder={t`Watermark field (e.g., id)`}
              value={localWatermarkField}
              onChange={handleWatermarkFieldChange}
              size="xs"
              w={200}
            />
          )}
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
          label={
            validationResult.errorMessage ||
            (!hasWatermarkFieldIfNeeded
              ? t`Watermark field is required for incremental transforms`
              : undefined)
          }
          disabled={
            validationResult.errorMessage == null && hasWatermarkFieldIfNeeded
          }
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
