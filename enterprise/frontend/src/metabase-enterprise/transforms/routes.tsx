import { t } from "ttag";

import { Route } from "metabase/hoc/Title";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";

import { NewTransformPage } from "./pages/NewTransformPage";
import { TransformLayout } from "./pages/TransformLayout";
import { TransformQueryPage } from "./pages/TransformQueryPage";
import { TransformSchedulePage } from "./pages/TransformSchedulePage";
import { TransformTargetPage } from "./pages/TransformTargetPage";

export const getTransformRoutes = () => (
  <>
    <Route path="transforms">
      <Route title={t`Transforms`} component={TransformLayout}>
        <Route path="new/:type" component={NewTransformPage} />
        <Route path="new/card/:cardId" component={NewTransformPage} />
        <Route path=":transformId" component={TransformQueryPage} />
        <Route path=":transformId/schedule" component={TransformSchedulePage} />
        <Route path=":transformId/target" component={TransformTargetPage} />
      </Route>
    </Route>
    {PLUGIN_TRANSFORMS_PYTHON.getAdminRoutes()}
  </>
);
