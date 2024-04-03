import { useEffect, useState } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Button, Flex, Text } from "metabase/ui";

export const ButtonBar = ({
  onConfirm,
  onCancel,
  canConfirm,
  actionButtons,
  confirmButtonText,
  cancelButtonText,
}: {
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
    document.addEventListener("keypress", handleEnter);
    return () => {
      document.removeEventListener("keypress", handleEnter);
    };
  }, [canConfirm, onConfirm]);

  return (
    <Flex
      justify="space-between"
      align="center"
      p="md"
      style={{
        borderTop: `1px solid ${color("border")}`,
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
              setError(e?.data?.message ?? t`An error occurred`);
            }
          }}
          disabled={!canConfirm}
        >
          {confirmButtonText ?? t`Select`}
        </Button>
      </Flex>
    </Flex>
  );
};
