import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { Button, Flex, Text } from "metabase/ui";

import { useOmniPickerContext } from "../context";
import type { EntityPickerOptions, EntityPickerProps } from "../types";

import { NewCollectionDialog } from "./NewCollectionDialog";
import { NewDashboardDialog } from "./NewDashboardDialog";

export type ButtonBarProps = {
  onConfirm: EntityPickerProps["onChange"];
  onCancel: () => void;
  confirmButtonText?: EntityPickerOptions["confirmButtonText"];
  cancelButtonText?: EntityPickerOptions["cancelButtonText"];
};

export const ButtonBar = ({
  onConfirm,
  onCancel,
  confirmButtonText,
  cancelButtonText,
}: ButtonBarProps) => {
  const { path, isSelectableItem } = useOmniPickerContext();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const selectedItem = path[path.length - 1];

  const canConfirm = useMemo(() => {
    const selectedItem = path[path.length - 1];
    return isSelectableItem(selectedItem);
  }, [isSelectableItem, path]);

  const handleConfirm = useCallback(async () => {
    const selectedItem = path[path.length - 1];
    if (canConfirm) {
      await onConfirm(selectedItem);
    }
  }, [canConfirm, onConfirm, path]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.isComposing) {
        return;
      }
      if (canConfirm && e.key === "Enter") {
        handleConfirm();
      }
    };
    document.addEventListener("keydown", handleKeyPress);
    return () => {
      document.removeEventListener("keydown", handleKeyPress);
    };
  }, [handleConfirm, canConfirm]);

  const confirmText =
    typeof confirmButtonText === "function"
      ? confirmButtonText(selectedItem)
      : (confirmButtonText ?? t`Select`);

  return (
    <Flex
      justify="space-between"
      align="center"
      p="md"
      style={{
        borderTop: "1px solid var(--mb-color-border)",
      }}
    >
      <Flex gap="md">
        <NewCollectionDialog />
        <NewDashboardDialog />
      </Flex>
      {error && (
        <Text c="error" px="md" lh="1rem">
          {error}
        </Text>
      )}
      <Flex gap="md">
        <Button onClick={onCancel} type="button">
          {cancelButtonText ?? t`Cancel`}
        </Button>
        <Button
          ml={1}
          variant="filled"
          onClick={async () => {
            try {
              setError(null);
              setLoading(true);
              await handleConfirm();
            } catch (e: any) {
              console.error(e);
              setError(getErrorMessage(e));
            }
            setLoading(false);
          }}
          disabled={!canConfirm || loading}
          data-testid="entity-picker-select-button"
        >
          {confirmText}
        </Button>
      </Flex>
    </Flex>
  );
};
