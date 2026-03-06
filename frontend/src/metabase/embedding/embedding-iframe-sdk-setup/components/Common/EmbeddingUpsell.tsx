import { t } from "ttag";

import { UPGRADE_URL } from "metabase/admin/upsells/constants";
import { UpsellCard } from "metabase/common/components/UpsellCard";
import { UTM_LOCATION } from "metabase/embedding/embedding-iframe-sdk-setup/analytics";
import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";

type Props = {
  campaign: string;
};

export const EmbeddingUpsell = ({ campaign }: Props) => {
  const { isSimpleEmbedFeatureAvailable } = useSdkIframeEmbedSetupContext();

  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location: UTM_LOCATION,
  });

  if (isSimpleEmbedFeatureAvailable) {
    return null;
  }

  return (
    <UpsellCard
      title={t`Get more powerful embedding`}
      buttonLink={UPGRADE_URL}
      onClick={triggerUpsellFlow}
      campaign={campaign}
      location={UTM_LOCATION}
      /* eslint-disable-next-line metabase/no-literal-metabase-strings -- Button text */
      buttonText={t`Upgrade to Metabase Pro`}
      fullWidth
      maxWidth="initial"
    >
      {t`Upgrade to get access to embeds with single sign-on, drill through, advanced theming, the modular embedding SDK, and more.`}
    </UpsellCard>
  );
};
