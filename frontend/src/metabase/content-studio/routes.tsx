import { PLUGIN_CONTENT_STUDIO } from "metabase/plugins";
import { Route } from "metabase/router";

import { ContentStudioLayout } from "./app/pages/ContentStudioLayout";
import { ContentStudioUpsellPage } from "./app/pages/ContentStudioUpsellPage";
import { CanAccessContentStudio } from "./route-guards";

export function getContentStudioRoutes() {
  return (
    <Route element={<CanAccessContentStudio />}>
      <Route path="content-studio" element={<ContentStudioLayout />}>
        {PLUGIN_CONTENT_STUDIO.isEnabled ? (
          PLUGIN_CONTENT_STUDIO.getContentStudioContentRoutes()
        ) : (
          <>
            {/* A splat does not match the parent's empty path, so the index
             * needs its own route to reach the same page. */}
            <Route index element={<ContentStudioUpsellPage />} />
            <Route path="*" element={<ContentStudioUpsellPage />} />
          </>
        )}
      </Route>
    </Route>
  );
}
