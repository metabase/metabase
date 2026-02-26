import { createComponent } from "embedding-sdk-package/components/private/ComponentWrapper/ComponentWrapper";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

/**
 * A standalone chat panel for Metabot.
 *
 * @function
 * @category MetabotChat
 */
export const MetabotChat = createComponent(
  () => getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.MetabotChat,
);
