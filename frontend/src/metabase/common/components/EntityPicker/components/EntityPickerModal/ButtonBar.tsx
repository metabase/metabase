import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Button, Flex } from "metabase/ui";

export const ButtonBar = ({
  onConfirm,
  onCancel,
  canConfirm,
  actions,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  canConfirm?: boolean;
  actions: JSX.Element[];
}) => (
  <Flex
    justify="space-between"
    p="md"
    style={{
      borderTop: `1px solid ${color("border")}`,
    }}
  >
    <Flex gap="md">{actions}</Flex>
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
