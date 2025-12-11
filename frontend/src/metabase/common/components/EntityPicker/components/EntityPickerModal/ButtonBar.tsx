import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import type { OmniPickerItem } from "metabase/common/components/OmniPicker/types";
import { Button, Flex, Text } from "metabase/ui";

import { useOmniPickerContext } from "../../context";

export const ButtonBar = ({
  onConfirm,
  onCancel,
  actionButtons,
  confirmButtonText,
  cancelButtonText,
}: {
  onConfirm: (item: OmniPickerItem) => void;
  onCancel?: () => void;
  actionButtons: JSX.Element[];
  confirmButtonText?: string;
  cancelButtonText?: string;
}) => {
  const { path, isSelectableItem } = useOmniPickerContext();
  const [error, setError] = useState<string | null>(null);

  const canConfirm = useMemo(() => {
    const selectedItem = path[path.length - 1];
    return isSelectableItem(selectedItem);
  }, [isSelectableItem, path]);

  const handleConfirm = useCallback(() => {
    const selectedItem = path[path.length - 1];
    if (canConfirm) {
      onConfirm(selectedItem);
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

  return (
    <Flex
      justify="space-between"
      align="center"
      p="md"
      style={{
        borderTop: "1px solid var(--mb-color-border)",
      }}
    >
      <Flex gap="md">{actionButtons}</Flex>
      {error && (
        <Text color="error" px="md" lh="1rem">
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
              await handleConfirm();
            } catch (e: any) {
              console.error(e);
              setError(getErrorMessage(e));
            }
          }}
          disabled={!canConfirm}
          data-testid="entity-picker-select-button"
        >
          {confirmButtonText ?? t`Select`}
        </Button>
      </Flex>
    </Flex>
  );
};
