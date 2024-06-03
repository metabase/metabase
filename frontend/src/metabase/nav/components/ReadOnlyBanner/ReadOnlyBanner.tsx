import { t } from "ttag";

import { Flex, Icon, Text } from "metabase/ui";

export const ReadOnlyBanner = () => {
  return (
    <Flex py="0.75rem" px="1rem" bg="accent4" gap="md" align="center">
      <Icon color="text-dark" name="info_filled" />
      <Text fw="bold" color="text-dark">
        {/* eslint-disable-next-line no-literal-metabase-strings -- correct usage */}
        {t`Metabase is under maintenance and is operating in read-only mode.  It should only take up to 30 minutes.`}
      </Text>
    </Flex>
  );
};
