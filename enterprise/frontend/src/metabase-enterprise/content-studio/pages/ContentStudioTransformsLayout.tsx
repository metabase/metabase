import { Outlet } from "metabase/router";
import { TransformHostProvider } from "metabase/transforms/host";

import { useContentStudioTransformHost } from "../transform-host";

export function ContentStudioTransformsLayout() {
  const host = useContentStudioTransformHost();

  return (
    <TransformHostProvider value={host}>
      <Outlet />
    </TransformHostProvider>
  );
}
