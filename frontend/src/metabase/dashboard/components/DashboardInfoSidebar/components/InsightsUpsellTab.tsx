import { Link } from "react-router";
import { t } from "ttag";

import { UpsellCard } from "metabase/admin/upsells/components";
import { Box, Flex, Text } from "metabase/ui";

const usageAnalyticsIllustrationSource = "app/assets/img/usage-analytics.png";

export const InsightsUpsellTab = () => {
  return (
    <Flex justify="center">
      <Box
        component={UpsellCard}
        variant="large"
        title={t`See who’s doing what, when`}
        buttonText={t`Try for free`}
        buttonLink={"FIXME"}
        campaign="FIXME"
        source="FIXME"
        illustrationSrc={usageAnalyticsIllustrationSource}
        w="30rem"
        maw="30rem"
        lh="1.5rem"
      >
        <Text lh="1.5rem">
          {
            // eslint-disable-next-line no-literal-metabase-strings -- This only shows in OSS
            t`Get detailed reports for tracking Metabase content usage, performance, and configuration changes.`
          }
          <Link to={"FIXME"}>{t`Learn more`}</Link>
        </Text>
      </Box>
    </Flex>
  );
};
