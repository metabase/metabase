import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import ExternalLink from "metabase/core/components/ExternalLink";

import { UpsellBigCard } from "./components";
import S from "./components/Upsells.module.css";
import { useUpsellLink } from "./components/use-upsell-link";

export const UpsellWhitelabel = ({ source }: { source: string }) => {
  const isWhitelabeled = useHasTokenFeature("whitelabel");
  const docsLink =
    "https://www.metabase.com/docs/latest/configuring-metabase/appearance";

  const url = useUpsellLink({ url: docsLink, campaign: "whitelabel", source });

  if (isWhitelabeled) {
    return null;
  }

  return (
    <UpsellBigCard
      title={t`Make Metabase look like you`}
      campaign="whitelabel"
      buttonText={t`Try for free`}
      buttonLink="https://www.metabase.com/upgrade"
      source={source}
      illustrationSrc="app/assets/img/upsell-whitelabel.png"
    >
      {t`Customize your internal or customer-facing analytics with your brand name, logo, colors, font and more, and hide giveaway Metabase elements.`}
      <ExternalLink className={S.SecondaryCTALink} href={url}>
        Learn more
      </ExternalLink>
    </UpsellBigCard>
  );
};
