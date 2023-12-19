import { t } from "ttag";

import { Icon } from "metabase/core/components/Icon";
import { Button, Flex } from "metabase/ui";
import { color } from "metabase/lib/colors";

export const ButtonBar = ({
  onConfirm,
  onCancel,
  canConfirm,
  allowCreateNew,
  onCreateNew,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  canConfirm?: boolean;
  allowCreateNew?: boolean;
  onCreateNew?: () => void;
}) => (
  <Flex
    justify="space-between"
    p="md"
    style={{
      borderTop: `1px solid ${color("border")}`,
    }}
  >
    <Flex gap="md">
      {!!allowCreateNew && !!onCreateNew && (
        <Button onClick={onCreateNew} leftIcon={<Icon name="add" />}>
          {t`Create a new collection`}
        </Button>
      )}
    </Flex>
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
