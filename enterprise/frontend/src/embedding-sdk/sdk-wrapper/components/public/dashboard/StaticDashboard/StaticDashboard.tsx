import { createComponent } from "embedding-sdk/sdk-wrapper/components/private/ComponentWrapper/ComponentWrapper";

/**
 * A lightweight dashboard component.
 *
 * @function
 * @category Dashboard
 * @param props
 */
export const StaticDashboard = createComponent(
  () => window.MetabaseEmbeddingSDK?.StaticDashboard,
);
