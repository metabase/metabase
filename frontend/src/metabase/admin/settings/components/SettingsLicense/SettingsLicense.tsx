import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useSelector } from "metabase/lib/redux";
import { getUpgradeUrl } from "metabase/selectors/settings";
import { Box, Button, Divider, Flex, Text } from "metabase/ui";
import type { State } from "metabase-types/store";

import { SettingHeader } from "../SettingHeader";

import { ExplorePlansIllustration } from "./ExplorePlansIllustration";

export const SettingsLicense = () => {
  const upgradeUrl = useSelector((state: State) =>
    getUpgradeUrl(state, { utm_content: "license" }),
  );

  return (
    <SettingsSection>
      <Box>
        <SettingHeader
          id="upsell"
          title={t`Looking for more?`}
          description={t`Metabase is open source and will be free forever – but by upgrading you can have priority support, more tools to help you share your insights with your teams and powerful options to help you create seamless, interactive data experiences for your customers.`}
        />
        <Text fw="bold" mt="xl">{t`Want to know more?`}</Text>
        <Flex mt="md" justify="space-between">
          <Button component={ExternalLink} variant="filled" href={upgradeUrl}>
            {t`Explore our paid plans`}
          </Button>
          <ExplorePlansIllustration />
        </Flex>
        <Divider />
      </Box>
    </SettingsSection>
  );
};
