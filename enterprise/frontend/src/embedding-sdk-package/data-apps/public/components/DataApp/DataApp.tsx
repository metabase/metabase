import { createComponent } from "embedding-sdk-package/components/private/ComponentWrapper/ComponentWrapper";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

export type { DataAppProps } from "embedding-sdk-bundle/components/public/DataApp";

/** Embed an existing data app by iframe. */
export const DataApp = createComponent(
  () => getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.DataApp,
);
