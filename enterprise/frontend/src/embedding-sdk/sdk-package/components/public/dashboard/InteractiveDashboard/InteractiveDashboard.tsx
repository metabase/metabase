import { createComponent } from "embedding-sdk/sdk-package/components/private/ComponentWrapper/ComponentWrapper";
import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";

/**
 * A dashboard component with drill downs, click behaviors, and the ability to view and click into questions.
 *
 * @function
 * @category Dashboard
 * @param props
 */
export const InteractiveDashboard = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.InteractiveDashboard,
);
