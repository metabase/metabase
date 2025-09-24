import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import { isEEBuild } from "metabase/lib/utils";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { Box } from "metabase/ui";

import { UpsellCta } from "./components/UpsellCta";
import { trackUpsellClicked } from "./components/analytics";
import { useUpsellLink } from "./components/use-upsell-link";

export function useUpsellEmbedJsCta({
  embedFlowUrl,
}: {
  embedFlowUrl: string;
}) {
  const campaign = "embedded-analytics-js";
  const location = "static-embed-popover";

  const isEmbedJsEnabled = useHasTokenFeature("embedding_simple");

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

  if (isEmbedJsEnabled) {
    return { internalLink: embedFlowUrl };
  }

  return {
    url,
    triggerUpsellFlow,
    trackUpsell,
  };
}

export function UpsellEmbedJsCta({ embedFlowUrl }: { embedFlowUrl: string }) {
  const { url, internalLink, triggerUpsellFlow, trackUpsell } =
    useUpsellEmbedJsCta({ embedFlowUrl });

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
