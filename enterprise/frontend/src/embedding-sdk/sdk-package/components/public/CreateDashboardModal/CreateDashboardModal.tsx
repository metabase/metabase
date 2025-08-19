import { createComponent } from "embedding-sdk/sdk-package/components/private/ComponentWrapper/ComponentWrapper";
import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";

/**
 * Creates a dashboard
 *
 * @function
 * @category CreateDashboardModal
 */
export const CreateDashboardModal = createComponent(
  () => getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.CreateDashboardModal,
);
