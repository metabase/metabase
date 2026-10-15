import { t } from "ttag";

import { Flex, Icon, Text } from "metabase/ui";

export function NavbarErrorView() {
  return (
    <Flex flex={1} align="center" justify="center">
      <Flex direction="column" align="center" c="core-brand" ta="center">
        <Icon name="warning" size={24} />
        <Text fw={400} mt="0.5rem" c="text-disabled" size="lg">
          {t`An error occurred`}
        </Text>
      </Flex>
    </Flex>
  );
}
