import type { ReactNode } from "react";

import { getWindow } from "embedding-sdk-shared/lib/get-window";

/**
 * Wraps the data-app tree. The implementation lives in the SDK bundle
 * — this is a thin forwarder that renders the bundle's component when
 * the bundle has loaded, falling back to a passthrough otherwise so
 * `<DataAppLink>` / `useDataAppLocation()` callers don't crash during
 * the bundle-loading window.
 *
 * @function
 * @category DataAppRouter
 */
export const DataAppRouter = ({ children }: { children?: ReactNode }) => {
  const DataAppRouter =
    getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.DataAppRouter;

  if (!DataAppRouter) {
    return <>{children}</>;
  }

  return <DataAppRouter>{children}</DataAppRouter>;
};
