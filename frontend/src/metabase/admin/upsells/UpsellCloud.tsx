import { c, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useHasTokenFeature } from "metabase/common/hooks";

import { UpsellBigCard } from "./components";
import S from "./components/Upsells.module.css";

export const UpsellCloud = ({
  source,
  onOpenModal,
}: {
  source: string;
  onOpenModal: () => void;
}) => {
  const isHosted = useHasTokenFeature("hosting");

  if (isHosted) {
    return null;
  }

  return (
    <UpsellBigCard
      title={t`Migrate to Metabase Cloud`}
      campaign="cloud"
      buttonText={t`Try for free`}
      source={source}
      onClick={onOpenModal}
      illustrationSrc="app/assets/img/upsell-cloud.png"
    >
      {c("'restores' and 'upgrades' are nouns in plural in this context")
        .t`Get automatic backups, restores, and upgrades, built-in network monitoring, unlimited expert help from engineers and more.`}{" "}
      <strong>{t`All your dashboards and questions will be copied to your Cloud instance.`}</strong>{" "}
      {t`Get your first 14 days of Metabase Cloud for free.`}
      <ExternalLink
        className={S.SecondaryCTALink}
        href="https://www.metabase.com/cloud"
      >
        {t`Learn more`}
      </ExternalLink>
    </UpsellBigCard>
  );
};
