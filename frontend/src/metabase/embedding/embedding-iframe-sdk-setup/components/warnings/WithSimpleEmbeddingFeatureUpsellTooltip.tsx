import type { ReactNode } from "react";
import { t } from "ttag";

import { UpsellGem } from "metabase/admin/upsells/components";
import { UpsellCard } from "metabase/common/components/UpsellCard";
import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import { useSelector } from "metabase/lib/redux";
import { getUpgradeUrl } from "metabase/selectors/settings";

import { TooltipWarning, type TooltipWarningMode } from "./TooltipWarning";

const UPSELL_CARD_WIDTH = 252;

export const WithSimpleEmbeddingFeatureUpsellTooltip = ({
  mode,
  children,
  enableTooltip,
  campaign,
}: {
  mode?: TooltipWarningMode;
  children: (data: { disabled: boolean; hoverCard: ReactNode }) => ReactNode;
  enableTooltip: boolean;
  campaign: string;
}) => {
  const { settings } = useSdkIframeEmbedSetupContext();

  const disabled = !!settings.isGuest;

  const upgradeUrl = useSelector((state) =>
    getUpgradeUrl(state, { utm_content: "embedding-page" }),
  );

  return (
    <TooltipWarning
      mode={mode}
      enableTooltip={enableTooltip}
      icon={<UpsellGem />}
      hovercard={
        <UpsellCard
          title={t`Get more powerful embedding`}
          buttonLink={upgradeUrl}
          campaign={campaign}
          location="embedded_analytics_js_wizard"
          /* eslint-disable-next-line no-literal-metabase-strings -- Button text */
          buttonText={t`Upgrade to Metabase Pro`}
          maxWidth={UPSELL_CARD_WIDTH}
        >
          {t`Upgrade to get access to embeds with single sign-on, drill through, the SDK for React, and more.`}
        </UpsellCard>
      }
      disabled={disabled}
    >
      {children}
    </TooltipWarning>
  );
};
