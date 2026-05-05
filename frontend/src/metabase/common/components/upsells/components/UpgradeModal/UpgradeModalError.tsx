import { t } from "ttag";

import { Button, Flex, Icon, Stack, Text, Title } from "metabase/ui";

interface UpgradeModalErrorProps {
  onClose: () => void;
}

export function UpgradeModalError({ onClose }: UpgradeModalErrorProps) {
  return (
    <Stack align="center" gap="lg" py="xl">
      <Flex
        align="center"
        justify="center"
        w={64}
        h={64}
        bg="error"
        style={{ borderRadius: "50%" }}
      >
        <Icon name="warning" c="white" size={32} />
      </Flex>

      <Stack align="center" gap="xs">
        <Title order={3} ta="center">
          {t`Something went wrong`}
        </Title>
        <Text c="text-secondary" ta="center">
          {t`Please try again later.`}
        </Text>
      </Stack>

      <Flex justify="center" w="100%">
        <Button variant="filled" color="brand" onClick={onClose}>
          {t`Close`}
        </Button>
      </Flex>
    </Stack>
  );
}
