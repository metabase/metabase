import { t } from "ttag";

import { UpsellCard } from "metabase/common/components/upsells/UpsellCard";
import { UTM_LOCATION } from "metabase/embedding/embedding-iframe-sdk-setup/analytics";
import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getUpgradeUrl } from "metabase/selectors/settings";

type Props = {
  campaign: string;
};

export const EmbeddingUpsell = ({ campaign }: Props) => {
  const { isSimpleEmbedFeatureAvailable } = useSdkIframeEmbedSetupContext();

  if (isSimpleEmbedFeatureAvailable) {
    return null;
  }

  return <EmbeddingUpsellInner campaign={campaign} />;
};

// useUpsellFlow hook sets window.name = "metabase-instance" in a useEffect
// which means we don't want to call useUpsellFlow unless necessary (as in, in Cypress for instance, where it breaks AUT).
const EmbeddingUpsellInner = ({ campaign }: Props) => {
  const upgradeUrl = useSelector((state) =>
    getUpgradeUrl(state, { utm_content: "embedding-page" }),
  );

  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location: "embedding-page",
  });

  return (
    <UpsellCard
      title={t`Get more powerful embedding`}
      buttonLink={upgradeUrl}
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
