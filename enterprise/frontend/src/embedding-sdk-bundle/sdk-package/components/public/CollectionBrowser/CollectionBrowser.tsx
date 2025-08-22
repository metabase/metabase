import { createComponent } from "embedding-sdk-bundle/sdk-package/components/private/ComponentWrapper/ComponentWrapper";
import { getWindow } from "embedding-sdk-bundle/sdk-shared/lib/get-window";

/**
 * A component that allows you to browse collections and their items.
 *
 * @function
 * @category CollectionBrowser
 */
export const CollectionBrowser = createComponent(
  () => getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.CollectionBrowser,
);
