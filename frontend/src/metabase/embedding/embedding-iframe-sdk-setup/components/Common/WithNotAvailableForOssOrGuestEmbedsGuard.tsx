import type { ReactNode } from "react";
import { t } from "ttag";

import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";

import { TooltipWarning } from "./TooltipWarning";

export const WithNotAvailableForOssOrGuestEmbedsGuard = ({
  children,
}: {
  children: (data: { disabled: boolean; hoverCard: ReactNode }) => ReactNode;
}) => {
  const { isSimpleEmbedFeatureAvailable, settings } =
    useSdkIframeEmbedSetupContext();

  if (!isSimpleEmbedFeatureAvailable) {
    return children({ disabled: true, hoverCard: null });
  }

  return (
    <TooltipWarning
      enableTooltip
      tooltip={t`Not available if Guest Mode is selected`}
      disabled={!!settings.isGuest}
    >
      {({ disabled: disabledForGuestEmbeds, hoverCard }) =>
        children({
          disabled: disabledForGuestEmbeds,
          hoverCard,
        })
      }
    </TooltipWarning>
  );
};
