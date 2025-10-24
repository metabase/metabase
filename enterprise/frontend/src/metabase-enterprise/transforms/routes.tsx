import { t } from "ttag";

import { Route } from "metabase/hoc/Title";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";

import { TransformLayout } from "./pages/TransformLayout";
import { TransformQueryPage } from "./pages/TransformQueryPage";

export const getTransformRoutes = () => (
  <>
    <Route path="transforms">
      <Route title={t`Transforms`} component={TransformLayout}>
        <Route path=":transformId" component={TransformQueryPage} />
      </Route>
    </Route>
    {PLUGIN_TRANSFORMS_PYTHON.getAdminRoutes()}
  </>
);
