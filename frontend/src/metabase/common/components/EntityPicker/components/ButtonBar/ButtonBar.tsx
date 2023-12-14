import { t } from "ttag";

import { Button, Flex } from "metabase/ui";
import { color } from "metabase/lib/colors";

export const ButtonBar = ({
  onConfirm,
  onCancel,
  canConfirm,
}: {
  onConfirm: (item: any) => void;
  onCancel: () => void;
  canConfirm?: boolean;
}) => (
  <Flex
    justify="space-between"
    p="md"
    style={{
      borderTop: `1px solid ${color("border")}`,
    }}
  >
    <Flex gap="md"></Flex>
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
