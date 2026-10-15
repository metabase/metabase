import { t } from "ttag";

import { Anchor, Box, Text } from "metabase/ui";

export const StillNeedHelp = () => {
  return (
    <Box bg="background_page-secondary" bdrs="sm" py="md" px="lg" mt="xl">
      <Box c="text-secondary" fw="bold" tt="uppercase" mb="sm">
        {t`Still need help?`}
      </Box>
      <Text c="text-secondary">
        {t`You can ask for billing help at `}
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <Anchor href="mailto:billing@metabase.com">billing@metabase.com</Anchor>
      </Text>
    </Box>
  );
};
