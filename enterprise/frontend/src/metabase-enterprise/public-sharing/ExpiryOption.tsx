import { t } from "ttag";

import type { ExpiryOptionProps } from "metabase/plugins/oss/public-sharing";
import { Checkbox, Flex, NumberInput, Text } from "metabase/ui";

export const ExpiryOption = ({
  expiresInMinutes,
  onChangeExpiresInMinutes,
}: ExpiryOptionProps) => {
  const isEnabled = expiresInMinutes !== null;

  return (
    <Flex direction="column" gap="xs" mt="md">
      <Checkbox
        label={t`Auto-expire this link`}
        checked={isEnabled}
        onChange={(event) => {
          onChangeExpiresInMinutes(event.currentTarget.checked ? 60 : null);
        }}
      />
      {isEnabled && (
        <Flex align="center" gap="xs" ml="xl">
          <Text size="sm" c="text-secondary">{t`Expires in`}</Text>
          <NumberInput
            value={expiresInMinutes}
            onChange={(val) =>
              onChangeExpiresInMinutes(
                typeof val === "number" && val > 0 ? val : 1,
              )
            }
            min={1}
            w="5rem"
            size="xs"
          />
          <Text size="sm" c="text-secondary">{t`minutes`}</Text>
        </Flex>
      )}
    </Flex>
  );
};
