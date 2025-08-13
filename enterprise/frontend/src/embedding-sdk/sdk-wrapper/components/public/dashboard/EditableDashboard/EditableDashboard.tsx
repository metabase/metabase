import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import { createComponent } from "embedding-sdk/sdk-wrapper/components/private/ComponentWrapper/ComponentWrapper";

/**
 * A dashboard component with the features available in the `InteractiveDashboard` component, as well as the ability to add and update questions, layout, and content within your dashboard.
 *
 * @function
 * @category Dashboard
 * @param props
 */
export const EditableDashboard = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.EditableDashboard,
);
