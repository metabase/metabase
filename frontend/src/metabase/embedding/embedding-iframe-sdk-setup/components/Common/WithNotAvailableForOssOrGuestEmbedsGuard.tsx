import type { ReactNode } from "react";
import { t } from "ttag";

import { TooltipWarning } from "metabase/embedding/embedding-iframe-sdk-setup/components/Common/TooltipWarning";
import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";

export const WithNotAvailableForOssOrGuestEmbedsGuard = ({
  children,
}: {
  children: (data: { disabled: boolean; hoverCard: ReactNode }) => ReactNode;
}) => {
  const { isSimpleEmbedFeatureAvailable, settings } =
    useSdkIframeEmbedSetupContext();

  return (
    <TooltipWarning
      enableTooltip={isSimpleEmbedFeatureAvailable}
      tooltip={t`Not available if Guest Mode is selected`}
      disabled={!!settings.isGuest}
    >
      {({ disabled: disabledForGuestEmbeds, hoverCard }) =>
        children({
          disabled: !isSimpleEmbedFeatureAvailable || disabledForGuestEmbeds,
          hoverCard,
        })
      }
    </TooltipWarning>
  );
};
