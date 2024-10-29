import { t } from "ttag";

import { Banner } from "metabase/components/Banner";
import { Icon, Text, useMantineTheme } from "metabase/ui";

export const ReadOnlyBanner = () => {
  const theme = useMantineTheme();
  return (
    <Banner
      py="0.75rem"
      px="1rem"
      bg={theme.fn.themeColor("accent4")}
      gap="md"
      align="center"
    >
      <Icon color="text-dark" name="info_filled" />
      <Text fw="bold" color="text-dark">
        {/* eslint-disable-next-line no-literal-metabase-strings -- correct usage */}
        {t`Metabase is under maintenance and is operating in read-only mode. It should only take up to 30 minutes.`}
      </Text>
    </Banner>
  );
};
