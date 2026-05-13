import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { UpsellCard } from "metabase/common/components/upsells/UpsellCard";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { useSelector } from "metabase/redux/hooks";
import { getUpgradeUrl } from "metabase/selectors/settings";
import { Text } from "metabase/ui";

export function EmbeddedMetabotUpsell() {
  const campaign = "embedded-metabot";
  const location = "metabot-settings";
  const upgradeUrl = useSelector((state) =>
    getUpgradeUrl(state, { utm_campaign: campaign, utm_content: location }),
  );
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });

  return (
    <UpsellCard
      title={t`Embed AI chat in your product`}
      buttonLink={upgradeUrl}
      onClick={triggerUpsellFlow}
      campaign={campaign}
      location={location}
      buttonText={t`Upgrade to Metabase Pro`}
      fullWidth
      maxWidth="initial"
    >
      <Text lh="lg">
        {t`With Modular Embedding, you can put an AI chat component in your app to make it easier for your customers to get answers from data.`}{" "}
        <ExternalLink href="https://www.metabase.com/docs/latest/embedding/sdk/ai-chat">{t`Learn more`}</ExternalLink>
      </Text>
    </UpsellCard>
  );
}
