import { createComponent } from "embedding-sdk/sdk-package/components/private/ComponentWrapper/ComponentWrapper";
import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";

/**
 * @internal
 */
export const SdkDebugInfo = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.SdkDebugInfo,
);
