import { t } from "ttag";

import { Route } from "metabase/hoc/Title";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";

import { TransformLayout } from "./pages/TransformLayout";
import { TransformQueryPage } from "./pages/TransformQueryPage";
import { TransformSchedulePage } from "./pages/TransformSchedulePage";

export const getTransformRoutes = () => (
  <>
    <Route path="transforms">
      <Route title={t`Transforms`} component={TransformLayout}>
        <Route path=":transformId" component={TransformQueryPage} />
        <Route path=":transformId/schedule" component={TransformSchedulePage} />
      </Route>
    </Route>
    {PLUGIN_TRANSFORMS_PYTHON.getAdminRoutes()}
  </>
);
