import { createComponent } from "embedding-sdk-bundle/sdk-package/components/private/ComponentWrapper/ComponentWrapper";
import { getWindow } from "embedding-sdk-bundle/sdk-shared/lib/get-window";

/**
 * Creates a dashboard
 *
 * @function
 * @category CreateDashboardModal
 */
export const CreateDashboardModal = createComponent(
  () => getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.CreateDashboardModal,
);
