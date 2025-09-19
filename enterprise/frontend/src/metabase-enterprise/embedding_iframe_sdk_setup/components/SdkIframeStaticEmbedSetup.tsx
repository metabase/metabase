import type { SdkIframeStaticEmbedSetupProps } from "metabase/plugins";

import { SdkIframeEmbedSetupContent } from "./SdkIframeEmbedSetup";
import { SdkIframeEmbedSetupProvider } from "./SdkIframeEmbedSetupProvider";

export const SdkIframeStaticEmbedSetup = ({
  resourceType,
  resourceId,
}: SdkIframeStaticEmbedSetupProps) => (
  <SdkIframeEmbedSetupProvider
    startWith={{
      step: "select-embed-options",
      type: resourceType,
      defaultResourceId: resourceId,
    }}
  >
    <SdkIframeEmbedSetupContent />
  </SdkIframeEmbedSetupProvider>
);
