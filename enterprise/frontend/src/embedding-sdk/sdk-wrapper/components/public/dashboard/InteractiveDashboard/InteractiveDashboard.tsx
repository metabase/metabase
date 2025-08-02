import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import { createComponent } from "embedding-sdk/sdk-wrapper/components/private/ComponentWrapper/ComponentWrapper";

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
