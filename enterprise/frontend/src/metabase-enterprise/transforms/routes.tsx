import { IndexRoute } from "react-router";
import { t } from "ttag";

import { Route } from "metabase/hoc/Title";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";

import { TransformLayout } from "./pages/TransformLayout";
import { TransformListLayout } from "./pages/TransformListLayout";
import { TransformQueryPage } from "./pages/TransformQueryPage";

export const getTransformRoutes = () => (
  <>
    <Route path="transforms">
      <Route title={t`Transforms`} component={TransformListLayout}>
        <Route path=":transformId" component={TransformLayout}>
          <IndexRoute component={TransformQueryPage} />
        </Route>
      </Route>
    </Route>
    {PLUGIN_TRANSFORMS_PYTHON.getAdminRoutes()}
  </>
);
