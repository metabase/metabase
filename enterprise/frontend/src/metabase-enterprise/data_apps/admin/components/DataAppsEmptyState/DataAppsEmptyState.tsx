import { t } from "ttag";

import { Flex, Icon, Text } from "metabase/ui";

export const DataAppsEmptyState = () => (
  <Flex
    direction="column"
    align="center"
    justify="center"
    gap="md"
    bd="1px solid var(--mb-color-border)"
    bdrs="md"
    bg="background-primary"
    mih="16rem"
    p="xl"
  >
    <Flex
      align="center"
      justify="center"
      w="6rem"
      h="6rem"
      bg="background-secondary"
      style={{ borderRadius: "50%" }}
    >
      <Icon name="app" size={48} c="border" />
    </Flex>
    <Text c="text-disabled">{t`Your data apps will appear here`}</Text>
  </Flex>
);
