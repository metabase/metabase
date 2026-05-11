import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { UpsellCard } from "metabase/common/components/upsells/UpsellCard";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { useSelector } from "metabase/redux/hooks";
import { getUpgradeUrl } from "metabase/selectors/settings";
import { Text } from "metabase/ui";

const campaign = "TODO";
const UTM_LOCATION = "TODO";

export function EmbeddedMetabotUpsell() {
  const upgradeUrl = useSelector((state) =>
    getUpgradeUrl(state, { utm_content: "embedding-page" }),
  );
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location: "embedding-page",
  });

  return (
    <UpsellCard
      title={t`Bring AI chat to your product`}
      buttonLink={upgradeUrl}
      onClick={triggerUpsellFlow}
      campaign={campaign}
      location={UTM_LOCATION}
      buttonText={t`Upgrade to Metabase Pro`}
      fullWidth
      maxWidth="initial"
    >
      <Text lh="lg">
        {t`Make it easier for your customers to get answers from data. With the Modular embedding SDK, you can embed an AI assistant in your app to let your customers ask questions about your data in plain English.`}{" "}
        <ExternalLink href="https://www.metabase.com/docs/latest/embedding/sdk/ai-chat">{t`Learn more`}</ExternalLink>
      </Text>
    </UpsellCard>
  );
}
