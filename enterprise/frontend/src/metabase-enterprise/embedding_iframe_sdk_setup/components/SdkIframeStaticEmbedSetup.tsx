import type { SdkIframeStaticEmbedSetupProps } from "metabase/plugins";
import { Stack } from "metabase/ui";

import { SdkIframeEmbedSetupContent } from "./SdkIframeEmbedSetup";
import { SdkIframeEmbedSetupProvider } from "./SdkIframeEmbedSetupProvider";

export const SdkIframeStaticEmbedSetup = ({
  resourceType,
  resourceId,
}: SdkIframeStaticEmbedSetupProps) => (
  <Stack w="80rem">
    <SdkIframeEmbedSetupProvider
      startWith={{
        embeddingType: "static",
        step: "select-embed-options",
        resourceType,
        resourceId,
      }}
    >
      <SdkIframeEmbedSetupContent />
    </SdkIframeEmbedSetupProvider>
  </Stack>
);
