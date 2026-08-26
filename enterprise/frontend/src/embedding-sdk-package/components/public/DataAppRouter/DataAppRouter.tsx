import type { ReactNode } from "react";

import { getWindow } from "embedding-sdk-shared/lib/get-window";

export const DataAppRouter = ({ children }: { children?: ReactNode }) => {
  const BundleDataAppRouter =
    getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.DataAppRouter;

  if (!BundleDataAppRouter) {
    return <>{children}</>;
  }

  return <BundleDataAppRouter>{children}</BundleDataAppRouter>;
};
