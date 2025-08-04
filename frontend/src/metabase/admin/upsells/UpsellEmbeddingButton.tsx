import cx from "classnames";
import { t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";

import S from "./components/Upsells.module.css";
import { useUpsellLink } from "./components/use-upsell-link";

export const UpsellEmbeddingButton = ({
  url,
  campaign,
  location,
}: {
  url: string;
  campaign: string;
  location: string;
}) => {
  const upsellLink = useUpsellLink({
    url,
    campaign,
    location,
  });

  return (
    <ExternalLink href={upsellLink} className={cx(S.UpsellCTALink, S.Large)}>
      {t`Try for free`}
    </ExternalLink>
  );
};
