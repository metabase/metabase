import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useHasTokenFeature } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { getDocsUrl } from "metabase/selectors/settings";

import { UpsellBigCard } from "./components";
import S from "./components/Upsells.module.css";
import { useUpsellLink } from "./components/use-upsell-link";
import { UPGRADE_URL } from "./constants";

export const UpsellWhitelabel = ({ source }: { source: string }) => {
  const isWhitelabeled = useHasTokenFeature("whitelabel");
  const campaign = "whitelabel";
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location: source,
  });
  const docsUrl = useSelector((state) =>
    getDocsUrl(state, {
      page: "configuring-metabase/appearance",
    }),
  );

  // Even though getDocsUrl allows to pass utm params as one of the props,
  // the product requirement is to keep them in sync with the primary CTA.
  // That's why we're using useUpsellLink hook again here.
  const url = useUpsellLink({
    url: docsUrl,
    campaign: "whitelabel",
    location: source,
  });

  if (isWhitelabeled) {
    return null;
  }

  return (
    <UpsellBigCard
      title={t`Make Metabase look like you`}
      campaign={campaign}
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      source={source}
      illustrationSrc="app/assets/img/upsell-whitelabel.png"
      onClick={triggerUpsellFlow}
    >
      {t`Customize your internal or customer-facing analytics with your brand name, logo, colors, font and more, and hide giveaway Metabase elements.`}
      <ExternalLink className={S.SecondaryCTALink} href={url}>
        {t`Learn more`}
      </ExternalLink>
    </UpsellBigCard>
  );
};
