import { createComponent } from "embedding-sdk-package/components/private/ComponentWrapper/ComponentWrapper";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

export type { DataAppProps } from "embedding-sdk-bundle/components/public/DataApp";

/** Embed a data app using provider SSO, or a local API key for development. */
export const DataApp = createComponent(
  () => getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.DataApp,
);
