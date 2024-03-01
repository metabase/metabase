import { useEffect } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Button, Flex } from "metabase/ui";

export const ButtonBar = ({
  onConfirm,
  onCancel,
  canConfirm,
  actionButtons,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  canConfirm?: boolean;
  actionButtons: JSX.Element[];
}) => {
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
      p="md"
      style={{
        borderTop: `1px solid ${color("border")}`,
      }}
    >
      <Flex gap="md">{actionButtons}</Flex>
      <Flex gap="md">
        <Button onClick={onCancel}>{t`Cancel`}</Button>
        <Button
          ml={1}
          variant="filled"
          onClick={onConfirm}
          disabled={!canConfirm}
        >
          {t`Select`}
        </Button>
      </Flex>
    </Flex>
  );
};
