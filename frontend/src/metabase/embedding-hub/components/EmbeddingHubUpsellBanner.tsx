import { t } from "ttag";

import { UpsellBanner } from "metabase/common/components/upsells/components";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getUpgradeUrl } from "metabase/selectors/settings";

type Props = {
  title: string;
  campaign: string;
  location: string;
};

// Render this only when the upsell is actually shown: useUpsellFlow sets
// window.name in a useEffect, which renames the Cypress AUT frame and breaks
// cy.press on any page that mounts it (same reason as EmbeddingUpsell.tsx).
export function EmbeddingHubUpsellBanner({ title, campaign, location }: Props) {
  const upgradeUrl = useSelector((state) =>
    getUpgradeUrl(state, {
      utm_campaign: campaign,
      utm_content: location,
    }),
  );

  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });

  return (
    <UpsellBanner
      title={title}
      campaign={campaign}
      location={location}
      buttonText={t`Try Metabase Pro`}
      buttonLink={upgradeUrl}
      onClick={triggerUpsellFlow}
      large
    />
  );
}
