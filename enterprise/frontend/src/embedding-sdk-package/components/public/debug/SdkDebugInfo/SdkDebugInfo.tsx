import { createComponent } from "embedding-sdk-package/components/private/ComponentWrapper/ComponentWrapper";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

/**
 * Intended for debugging purposes only, so we don't want to expose it in the d.ts files.
 *
 * @internal
 */
export const SdkDebugInfo = createComponent(
  () => getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.SdkDebugInfo,
);
