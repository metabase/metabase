import { t, jt } from "ttag";

const RocketGlobeIllustrationSrc = "app/assets/img/rocket-globe.svg";
import { useSelector } from "metabase/lib/redux";
import { getIsHosted } from "metabase/setup/selectors";

import { UpsellCard } from "./components";

export const UpsellHosting = ({ source }: { source: string }) => {
  const isHosted = useSelector(getIsHosted);

  if (isHosted) {
    return null;
  }

  return (
    <UpsellCard
      title={t`Minimize maintenance`}
      campaign="hosting"
      buttonText={t`Learn more`}
      buttonLink="https://www.metabase.com/cloud"
      illustrationSrc={RocketGlobeIllustrationSrc}
      source={source}
      maxWidth={202}
    >
      {jt`${(
        <strong>{t`Migrate to Metabase Cloud`}</strong>
      )} for fast, reliable, and secure deployment.`}
    </UpsellCard>
  );
};

export const UpsellHostingUpdates = ({ source }: { source: string }) => {
  const isHosted = useSelector(getIsHosted);

  if (isHosted) {
    return null;
  }

  return (
    <UpsellCard
      title={t`Get automatic updates`}
      campaign="hosting"
      buttonText={t`Learn more`}
      buttonLink="https://www.metabase.com/cloud"
      illustrationSrc={RocketGlobeIllustrationSrc}
      source={source}
      maxWidth={202}
    >
      {jt`${(
        <strong>{t`Migrate to Metabase Cloud`}</strong>
      )} for fast, reliable, and secure deployment.`}
    </UpsellCard>
  );
};
