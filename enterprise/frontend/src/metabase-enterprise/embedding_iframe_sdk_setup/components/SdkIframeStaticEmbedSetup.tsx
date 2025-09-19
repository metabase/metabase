import type { SdkIframeStaticEmbedSetupProps } from "metabase/plugins";

import { SdkIframeEmbedSetupContent } from "./SdkIframeEmbedSetup";
import { SdkIframeEmbedSetupProvider } from "./SdkIframeEmbedSetupProvider";

export const SdkIframeStaticEmbedSetup = ({
  resourceType,
  resourceId,
}: SdkIframeStaticEmbedSetupProps) => (
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
);
