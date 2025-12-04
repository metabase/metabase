import type { ReactNode } from "react";
import { t } from "ttag";

import {
  TooltipWarning,
  type TooltipWarningMode,
} from "metabase/embedding/embedding-iframe-sdk-setup/components/warnings/TooltipWarning";
import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import { Text } from "metabase/ui";

import { WithNotAvailableWithoutSimpleEmbeddingFeatureWarning } from "./WithNotAvailableWithoutSimpleEmbeddingFeatureWarning";

export const WithNotAvailableForGuestEmbedsWarning = ({
  mode,
  children,
  campaign,
}: {
  mode?: TooltipWarningMode;
  children: (data: { disabled: boolean; hoverCard: ReactNode }) => ReactNode;
  campaign: string;
}) => {
  const { settings } = useSdkIframeEmbedSetupContext();

  return (
    <WithNotAvailableWithoutSimpleEmbeddingFeatureWarning
      mode={mode}
      campaign={campaign}
    >
      {({ disabled: disabledForOss, hoverCard: disabledForOssHoverCard }) => (
        <TooltipWarning
          enableTooltip={!disabledForOss}
          warning={
            <Text lh="md" p="md">
              {t`Not available if Guest Mode is selected`}
            </Text>
          }
          disabled={!!settings.isGuest}
        >
          {({
            disabled: disabledForGuestEmbeds,
            hoverCard: disabledForGuestEmbedsHoverCard,
          }) =>
            children({
              disabled: disabledForOss || disabledForGuestEmbeds,
              hoverCard:
                disabledForOssHoverCard || disabledForGuestEmbedsHoverCard,
            })
          }
        </TooltipWarning>
      )}
    </WithNotAvailableWithoutSimpleEmbeddingFeatureWarning>
  );
};
