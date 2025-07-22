import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import { createComponent } from "embedding-sdk/sdk-wrapper/components/private/ComponentWrapper/ComponentWrapper";

/**
 * @internal
 */
export const SdkDebugInfo = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkDebugInfo,
);
