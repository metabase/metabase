import { createComponent } from "embedding-sdk/sdk-wrapper/components/private/ComponentWrapper/ComponentWrapper";

/**
 * A dashboard component with the features available in the `InteractiveDashboard` component, as well as the ability to add and update questions, layout, and content within your dashboard.
 *
 * @function
 * @category Dashboard
 * @param props
 */
export const EditableDashboard = createComponent(
  () => window.MetabaseEmbeddingSDK?.EditableDashboard,
);
