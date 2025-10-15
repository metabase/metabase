import { t } from "ttag";

import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";

import { UpsellCta } from "./components/UpsellCta";
import { useUpsellLink } from "./components/use-upsell-link";

export const UpsellEmbeddingButton = ({
  url,
  campaign,
  location,
  size = "default",
}: {
  url: string;
  campaign: string;
  location: string;
  size?: "default" | "large";
}) => {
  const upsellLink = useUpsellLink({
    url,
    campaign,
    location,
  });

  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });

  return (
    <UpsellCta
      onClick={triggerUpsellFlow}
      buttonText={t`Try for free`}
      url={upsellLink}
      internalLink={undefined}
      onClickCapture={() => {}}
      size={size}
    />
  );
};
