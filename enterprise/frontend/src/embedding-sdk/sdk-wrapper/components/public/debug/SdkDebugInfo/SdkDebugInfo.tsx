import { createComponent } from "embedding-sdk/sdk-wrapper/components/private/ComponentWrapper/ComponentWrapper";

/**
 * @internal
 */
export const SdkDebugInfo = createComponent(
  () => window.MetabaseEmbeddingSDK?.SdkDebugInfo,
);
