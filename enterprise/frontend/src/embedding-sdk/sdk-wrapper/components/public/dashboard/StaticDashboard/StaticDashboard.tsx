import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import { createComponent } from "embedding-sdk/sdk-wrapper/components/private/ComponentWrapper/ComponentWrapper";

/**
 * A lightweight dashboard component.
 *
 * @function
 * @category Dashboard
 * @param props
 */
export const StaticDashboard = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.StaticDashboard,
);
