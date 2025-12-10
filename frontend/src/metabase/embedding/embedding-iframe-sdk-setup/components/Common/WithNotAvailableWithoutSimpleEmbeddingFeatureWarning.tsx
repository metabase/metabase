import type { ReactNode } from "react";

import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";

import type { TooltipWarningMode } from "../warnings/TooltipWarning";
import { WithSimpleEmbeddingFeatureUpsellTooltip } from "../warnings/WithSimpleEmbeddingFeatureUpsellTooltip";

export const WithNotAvailableWithoutSimpleEmbeddingFeatureWarning = ({
  mode,
  children,
  campaign,
}: {
  mode?: TooltipWarningMode;
  children: (data: { disabled: boolean; hoverCard: ReactNode }) => ReactNode;
  campaign: string;
}) => {
  const { isSimpleEmbedFeatureAvailable } = useSdkIframeEmbedSetupContext();

  return (
    <WithSimpleEmbeddingFeatureUpsellTooltip
      mode={mode}
      enableTooltip={!isSimpleEmbedFeatureAvailable}
      campaign={campaign}
    >
      {({ disabled, hoverCard }) => children({ disabled, hoverCard })}
    </WithSimpleEmbeddingFeatureUpsellTooltip>
  );
};
