import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import {
  UpsellCard,
  type UpsellCardProps,
} from "metabase/common/components/UpsellCard";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { getDocsUrl } from "metabase/selectors/settings";
import { Box, type BoxProps, Text } from "metabase/ui";

import { UPGRADE_URL } from "./constants";

const usageAnalyticsIllustrationSource = "app/assets/img/usage-analytics.png";

export const UpsellUsageAnalytics = (
  props: BoxProps &
    Omit<
      UpsellCardProps,
      "children" | "title" | "buttonText" | "buttonLink" | "campaign"
    >,
) => {
  const campaign = "usage_analytics";
  const { location } = props;
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });
  const usageAnalyticsUrl = useSelector((state) =>
    getDocsUrl(state, {
      page: "usage-and-performance-tools/usage-analytics",
    }),
  );
  return (
    <Box
      component={UpsellCard}
      large
      title={t`See who’s doing what, when`}
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      campaign={campaign}
      illustrationSrc={usageAnalyticsIllustrationSource}
      lh="1.5rem"
      onClick={triggerUpsellFlow}
      buttonStyle={{
        marginInlineStart: "2rem",
        width: "10rem",
        maxWidth: "100%",
      }}
      {...props}
    >
      <Text lh="1.5rem" style={{ paddingInlineStart: "2rem" }}>
        {t`Get detailed reports for tracking Metabase content usage, performance, and configuration changes.`}{" "}
        <ExternalLink href={usageAnalyticsUrl}>{t`Learn more`}</ExternalLink>
      </Text>
    </Box>
  );
};
