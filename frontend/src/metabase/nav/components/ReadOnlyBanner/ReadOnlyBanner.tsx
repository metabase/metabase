import { t } from "ttag";

import { Flex, Icon, Text } from "metabase/ui";

export const ReadOnlyBanner = () => {
  return (
    <Flex py="0.75rem" px="1rem" bg="accent5" gap="md" align="center">
      <Icon color="white" name="info_filled" />
      <Text fw="bold" c="white">
        {/* eslint-disable-next-line no-literal-metabase-strings -- correct usage */}
        {t`Metabase is under maintenance and is operating in read-only mode. Please contact your administrator for details.`}
      </Text>
    </Flex>
  );
};
