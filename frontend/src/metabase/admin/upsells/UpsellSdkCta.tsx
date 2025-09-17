import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { isEEBuild } from "metabase/lib/utils";
import { PLUGIN_ADMIN_SETTINGS, PLUGIN_EMBEDDING } from "metabase/plugins";
import { Box } from "metabase/ui";

import { UpsellCta } from "./components/UpsellCta";
import { trackUpsellClicked } from "./components/analytics";
import { useUpsellLink } from "./components/use-upsell-link";

export function useUpsellSdkCta() {
  const campaign = "embedding-interactive";
  const location = "static-embed-popover";

  const isInteractiveEmbeddingEnabled = useSelector(
    PLUGIN_EMBEDDING.isInteractiveEmbeddingEnabled,
  );

  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });

  const trackUpsell = () => trackUpsellClicked({ location, campaign });

  const url = useUpsellLink({
    url: `https://www.metabase.com/product/embedded-analytics`,
    campaign,
    location,
  });

  if (isInteractiveEmbeddingEnabled) {
    return {
      internalLink: "/admin/embedding/interactive",
    };
  }

  return {
    url,
    triggerUpsellFlow,
    trackUpsell,
  };
}

export function UpsellSdkCta() {
  const { url, internalLink, triggerUpsellFlow, trackUpsell } =
    useUpsellSdkCta();

  if (!isEEBuild()) {
    return null;
  }

  return (
    <Box>
      <UpsellCta
        onClick={triggerUpsellFlow}
        internalLink={internalLink}
        buttonText={t`Try for free`}
        url={url}
        onClickCapture={() => trackUpsell?.()}
        size="large"
      />
    </Box>
  );
}
