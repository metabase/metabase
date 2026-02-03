import { jt, t } from "ttag";

const RocketGlobeIllustrationSrc = "app/assets/img/rocket-globe.svg";
import { UpsellCard } from "metabase/common/components/UpsellCard";
import { useSelector } from "metabase/lib/redux";
import { getIsHosted } from "metabase/setup/selectors";

import { UpsellBanner } from "./components";

// the default 200px width will break the title into two lines
const UPSELL_CARD_WIDTH = 202;
const CLOUD_PAGE = "/admin/settings/cloud";

export const UpsellHosting = ({ location }: { location: string }) => {
  const isHosted = useSelector(getIsHosted);

  if (isHosted) {
    return null;
  }

  return (
    <UpsellCard
      title={t`Minimize maintenance`}
      campaign="hosting"
      buttonText={t`Learn more`}
      internalLink={CLOUD_PAGE}
      illustrationSrc={RocketGlobeIllustrationSrc}
      location={location}
      maxWidth={UPSELL_CARD_WIDTH}
    >
      {jt`${(
        <strong key="migrate">{t`Migrate to Metabase Cloud`}</strong>
      )} for fast, reliable, and secure deployment.`}
    </UpsellCard>
  );
};

export const UpsellHostingBanner = ({ location }: { location: string }) => {
  const isHosted = useSelector(getIsHosted);

  if (isHosted) {
    return null;
  }

  return (
    <UpsellBanner
      title={t`Minimize maintenance`}
      campaign="hosting"
      buttonText={t`Learn more`}
      internalLink="/admin/settings/cloud"
      location={location}
    >
      {jt`${(
        <strong key="migrate">{t`Migrate to Metabase Cloud`}</strong>
      )} for fast, reliable, and secure deployment.`}
    </UpsellBanner>
  );
};

export const UpsellHostingUpdates = ({ location }: { location: string }) => {
  const isHosted = useSelector(getIsHosted);

  if (isHosted) {
    return null;
  }

  return (
    <UpsellCard
      title={t`Get automatic updates`}
      campaign="hosting"
      buttonText={t`Learn more`}
      internalLink={CLOUD_PAGE}
      illustrationSrc={RocketGlobeIllustrationSrc}
      location={location}
      maxWidth={UPSELL_CARD_WIDTH}
    >
      {jt`${(
        <strong key="migrate">{t`Migrate to Metabase Cloud`}</strong>
      )} for fast, reliable, and secure deployment.`}
    </UpsellCard>
  );
};
