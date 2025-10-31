import { createComponent } from "embedding-sdk-package/components/private/ComponentWrapper/ComponentWrapper";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

/**
 * A lightweight dashboard component.
 *
 * @function
 * @category Dashboard
 * @param props
 */
export const StaticDashboard = createComponent(
  () => getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.StaticDashboard,
);
