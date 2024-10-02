import { t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import { Box, type BoxProps, Text } from "metabase/ui";

import { UpsellCard, type UpsellCardProps } from "./components";

const usageAnalyticsIllustrationSource = "app/assets/img/usage-analytics.png";

export const UpsellUsageAnalytics = (
  props: BoxProps &
    Omit<
      UpsellCardProps,
      "children" | "title" | "buttonText" | "buttonLink" | "campaign"
    >,
) => {
  const usageAnalyticsUrl = useSelector(state =>
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
      buttonLink="https://www.metabase.com/upgrade"
      campaign="usage-analytics"
      illustrationSrc={usageAnalyticsIllustrationSource}
      lh="1.5rem"
      {...props}
    >
      <Text lh="1.5rem" style={{ paddingInlineStart: "2rem" }}>
        {t`Get detailed reports for tracking Metabase content usage, performance, and configuration changes.`}{" "}
        <ExternalLink href={usageAnalyticsUrl}>{t`Learn more`}</ExternalLink>
      </Text>
    </Box>
  );
};
