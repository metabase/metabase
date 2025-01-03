import { useEffect, useState } from "react";
import { t } from "ttag";

import { Button, Flex, Text } from "metabase/ui";

export const ButtonBar = ({
  modalRef,
  onConfirm,
  onCancel,
  canConfirm,
  actionButtons,
  confirmButtonText,
  cancelButtonText,
}: {
  modalRef: React.RefObject<HTMLElement>;
  onConfirm: () => void;
  onCancel: () => void;
  canConfirm?: boolean;
  actionButtons: JSX.Element[];
  confirmButtonText?: string;
  cancelButtonText?: string;
}) => {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const handleEnter = (e: KeyboardEvent) => {
      if (canConfirm && e.key === "Enter") {
        onConfirm();
      }
    };
    // TODO: kinda iffy on this idea...
    const modal = modalRef.current;
    modal?.addEventListener("keypress", handleEnter);
    return () => modal?.removeEventListener("keypress", handleEnter);
  }, [canConfirm, onConfirm, modalRef]);

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
              await onConfirm();
            } catch (e: any) {
              console.error(e);
              setError(e?.data?.message ?? t`An error occurred`);
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
